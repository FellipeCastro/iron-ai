import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { aiReservations, aiUsage, aiUsageUser, db, messages, usageCounters } from "@/db/client";
import { aiCostUsd, type TokenUsage } from "./ai/pricing";
import { numberEnv } from "./env";

// Free tier guards: per-user message caps (daily and monthly), a per-user daily OpenAI spend ceiling,
// a global daily ceiling and a separate small ceiling for the (expensive) fallback model.

// ASSUMPTIONS to tune with real usage (see ai_usage): a real workout is ~20-50 messages.
export const dailyMessageLimit = () => numberEnv("DAILY_MESSAGE_LIMIT", 60);
export const monthlyMessageLimit = () => numberEnv("MONTHLY_MESSAGE_LIMIT", 1000);

/** Counts one message for the user on their local date and returns the new total. */
export async function countMessage(userId: string, date: string) {
  const [row] = await db
    .insert(usageCounters)
    .values({ userId, date, count: 1 })
    .onConflictDoUpdate({ target: [usageCounters.userId, usageCounters.date], set: { count: sql`${usageCounters.count} + 1` } })
    .returning({ count: usageCounters.count });
  return row.count;
}

export type Admission = {
  /** True when the update passed both caps and may be enqueued. */
  admitted: boolean;
  /** Which cap turned it away, if any. */
  rejectedBy?: "daily" | "monthly";
  /** The user's counts right after this message was counted (undefined when an earlier delivery already decided). */
  daily?: number;
  monthly?: number;
};

/**
 * Counts the update against the caps and commits the verdict on its `messages` row in ONE transaction (db.batch):
 * "admitting" -> "received" (admitted) or "ignored" (over a cap). The row lock taken first makes a concurrent
 * redelivery wait for the verdict, and the count only happens while the row is still "admitting", so repeats never
 * burn quota twice. Enqueue only after this resolves with admitted: true; a retry after a failed enqueue finds the
 * row already "received" and is admitted without being counted again.
 */
export async function admitMessage(updateId: number, userId: string, date: string, dailyLimit: number, monthlyLimit: number): Promise<Admission> {
  const monthStart = `${date.slice(0, 7)}-01`;
  const [, , bump, verdict] = await db.batch([
    // User lock, taken before any read or write: admissions of one user on different local dates all touch the month
    // total, so they run one at a time and each sees the increments the earlier ones committed. Held until commit.
    db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`),
    // Row lock: serializes concurrent deliveries of the same update.
    db.update(messages).set({ status: sql`${messages.status}` }).where(and(eq(messages.updateId, updateId), eq(messages.status, "admitting"))),
    db.execute(sql`
      insert into usage_counters (user_id, date, count)
      select ${userId}::uuid, ${date}::date, 1
      where exists (select 1 from messages where update_id = ${updateId} and status = 'admitting')
      on conflict (user_id, date) do update set count = usage_counters.count + 1
      returning count`),
    db.execute(sql`
      update messages set status = case
        when (select count from usage_counters where user_id = ${userId}::uuid and date = ${date}::date) > ${dailyLimit}
          or (select coalesce(sum(count), 0) from usage_counters where user_id = ${userId}::uuid and date >= ${monthStart}::date and date < (${monthStart}::date + interval '1 month')::date) > ${monthlyLimit}
        then 'ignored'::message_status else 'received'::message_status end
      where update_id = ${updateId} and status = 'admitting'
      returning status::text as status,
        (select coalesce(sum(count), 0)::int from usage_counters where user_id = ${userId}::uuid and date >= ${monthStart}::date and date < (${monthStart}::date + interval '1 month')::date) as monthly`),
  ]);

  const counted = bump.rows[0] as { count: number } | undefined;
  const decided = verdict.rows[0] as { status: string; monthly: number } | undefined;
  if (!counted || !decided) {
    // An earlier or concurrent delivery already committed the verdict.
    const existing = await db.query.messages.findFirst({ where: eq(messages.updateId, updateId), columns: { status: true } });
    return { admitted: existing?.status === "received" };
  }
  const daily = Number(counted.count);
  const monthly = Number(decided.monthly);
  if (decided.status === "received") return { admitted: true, daily, monthly };
  return { admitted: false, rejectedBy: daily > dailyLimit ? "daily" : "monthly", daily, monthly };
}

export async function messagesToday(userId: string, date: string) {
  const row = await db.query.usageCounters.findFirst({
    where: (t, { and, eq }) => and(eq(t.userId, userId), eq(t.date, date)),
  });
  return row?.count ?? 0;
}

/** Messages counted from the first day of `date`'s month through `date` (the user's local calendar). */
export async function messagesThisMonth(userId: string, date: string) {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${usageCounters.count}), 0)::int` })
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), gte(usageCounters.date, `${date.slice(0, 7)}-01`)));
  return row?.total ?? 0;
}

export const dailyBudgetUsd = () => numberEnv("OPENAI_DAILY_BUDGET_USD", 5);
/** Per user and UTC day. A typical user spends ~US$ 0.02/day; 60 messages cost ~US$ 0.12. */
export const userDailyBudgetUsd = () => numberEnv("OPENAI_USER_DAILY_BUDGET_USD", 0.25);
/** Part of the global budget the fallback model may use per day. */
export const fallbackDailyBudgetUsd = () => numberEnv("OPENAI_FALLBACK_DAILY_BUDGET_USD", 1);
const ALERT_SHARE = 0.8;

const utcDate = (now = new Date()) => now.toISOString().slice(0, 10);

export class BudgetExceededError extends Error {
  constructor() {
    super("OpenAI daily budget exceeded");
  }
}

export class UserBudgetExceededError extends Error {
  constructor() {
    super("OpenAI per-user daily budget exceeded");
  }
}

// A paid call is first RESERVED: an estimate is added to the day's cost in one atomic statement that only succeeds
// while the ceiling is not reached. Checking and then paying lets every call in flight pass the same check (a
// burst across users overshoots the global ceiling by the burst size). recordAiUsage then swaps the estimate for
// the real cost, and releaseAiBudget gives it back when the call fails. Estimates keep up to 4 decimals (the column scale).
export const parseEstimateUsd = () => numberEnv("OPENAI_PARSE_ESTIMATE_USD", 0.003);
export const fallbackEstimateUsd = () => numberEnv("OPENAI_FALLBACK_ESTIMATE_USD", 0.02);

export type AiReservation = {
  /** ai_reservations row: lets a failed release be retried (releaseAiBudget is idempotent per id). */
  id: string;
  date: string;
  userId: string;
  /** Held on the global and the user's daily cost. */
  usd: number;
  /** Held on the fallback ceiling only (see reserveFallback). */
  fallbackUsd: number;
};

/** Reserves `usd` against the global and the user's daily ceilings. Throws when either is already reached. */
export async function reserveAiBudget(userId: string, usd: number): Promise<AiReservation> {
  const date = utcDate();
  // Row exists: add the estimate only while under the ceiling. No row yet: this insert creates it.
  const [global] = await db
    .insert(aiUsage)
    .values({ date, costUsd: usd })
    .onConflictDoUpdate({
      target: aiUsage.date,
      set: { costUsd: sql`${aiUsage.costUsd} + ${usd}` },
      setWhere: sql`${aiUsage.costUsd} < ${dailyBudgetUsd()}`,
    })
    .returning({ date: aiUsage.date });
  if (!global) throw new BudgetExceededError();

  const [user] = await db
    .insert(aiUsageUser)
    .values({ userId, date, costUsd: usd })
    .onConflictDoUpdate({
      target: [aiUsageUser.userId, aiUsageUser.date],
      set: { costUsd: sql`${aiUsageUser.costUsd} + ${usd}` },
      setWhere: sql`${aiUsageUser.costUsd} < ${userDailyBudgetUsd()}`,
    })
    .returning({ date: aiUsageUser.date });
  if (!user) {
    await db.update(aiUsage).set({ costUsd: sql`${aiUsage.costUsd} - ${usd}` }).where(eq(aiUsage.date, date));
    throw new UserBudgetExceededError();
  }
  // Persisted last: if the process dies before this, the hold has no row to recover from (a window of two statements).
  const [row] = await db.insert(aiReservations).values({ userId, date, usd }).returning({ id: aiReservations.id });
  return { id: row.id, date, userId, usd, fallbackUsd: 0 };
}

const rowsOf = (res: unknown) => (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as Record<string, unknown>[];

/** Reserves `usd` against today's fallback ceiling. False when it is already spent (the fallback bills ~7x the primary). */
export async function reserveFallback(reservation: AiReservation, usd: number) {
  // One statement: the ceiling hold and its record on the reservation row commit together, so a release always
  // gives back exactly what was held.
  const res = await db.execute(sql`
    with held as (
      update ai_usage set fallback_cost_usd = fallback_cost_usd + ${usd}
      where date = ${reservation.date}::date and fallback_cost_usd < ${fallbackDailyBudgetUsd()}
      returning date
    ), mark as (
      update ai_reservations set fallback_usd = fallback_usd + ${usd}
      where id = ${reservation.id}::uuid and closed_at is null and exists (select 1 from held)
      returning id
    )
    select (select count(*) from held)::int as held, (select count(*) from mark)::int as marked`);
  const row = rowsOf(res)[0];
  if (!Number(row?.held)) return false;
  reservation.fallbackUsd += usd;
  return true;
}

/**
 * Gives a reservation back when the call did not happen or failed. Idempotent: the row is closed and the amounts it
 * holds are subtracted in ONE statement, so a retry (or a later sweep) after an earlier release committed finds it
 * closed and subtracts nothing. Do not call it after recordAiUsage (which closes the row itself).
 */
export async function releaseAiBudget(reservation: Pick<AiReservation, "id">) {
  const res = await db.execute(sql`
    with claim as (
      update ai_reservations set closed_at = now()
      where id = ${reservation.id}::uuid and closed_at is null
      returning date, user_id, usd, fallback_usd
    ), global as (
      update ai_usage set cost_usd = ai_usage.cost_usd - claim.usd, fallback_cost_usd = ai_usage.fallback_cost_usd - claim.fallback_usd
      from claim where ai_usage.date = claim.date
      returning 1
    ), per_user as (
      update ai_usage_user set cost_usd = ai_usage_user.cost_usd - claim.usd
      from claim where ai_usage_user.user_id = claim.user_id and ai_usage_user.date = claim.date
      returning 1
    )
    select count(*)::int as released from claim`);
  return Number(rowsOf(res)[0]?.released) > 0;
}

/**
 * Recovery for releases that failed (or processes that died mid-call): releases every reservation still open after
 * `olderThanMs`, long past any OpenAI timeout. Safe to run concurrently and repeatedly.
 */
export async function releaseStaleReservations(olderThanMs = 30 * 60_000, limit = 200) {
  const stale = await db
    .select({ id: aiReservations.id })
    .from(aiReservations)
    .where(and(isNull(aiReservations.closedAt), lt(aiReservations.createdAt, new Date(Date.now() - olderThanMs))))
    .limit(limit);
  let released = 0;
  for (const { id } of stale) if (await releaseAiBudget({ id })) released++;
  return released;
}

/** Release for a failure path: one retry, then leave the open row for releaseStaleReservations. Never throws. */
export async function releaseAiBudgetSafe(reservation: Pick<AiReservation, "id">) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await releaseAiBudget(reservation);
      return;
    } catch {
      // The reservation row stays open; the periodic sweep retries.
    }
  }
}

/**
 * Records one OpenAI call and settles its reservation (the estimate is replaced by the real cost, on the day it was
 * reserved). Returns true the first time the day crosses the alert threshold.
 */
export async function recordAiUsage(userId: string, model: string, usage: TokenUsage, fallback: boolean, reservation?: AiReservation) {
  const cost = aiCostUsd(model, usage);
  const date = reservation?.date ?? utcDate();
  // Close the reservation first. If a sweep already released it, nothing is held any more and the full cost is
  // added; claiming before settling means a crash in between over-counts (safe) instead of subtracting twice.
  let held = 0;
  let heldFallback = 0;
  if (reservation) {
    const [claimed] = await db
      .update(aiReservations)
      .set({ closedAt: new Date() })
      .where(and(eq(aiReservations.id, reservation.id), isNull(aiReservations.closedAt)))
      .returning({ usd: aiReservations.usd, fallbackUsd: aiReservations.fallbackUsd });
    held = claimed?.usd ?? 0;
    heldFallback = claimed?.fallbackUsd ?? 0;
  }
  const [row] = await db
    .insert(aiUsage)
    .values({
      date,
      requests: 1,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
      costUsd: cost,
      fallbackCostUsd: fallback ? cost : 0,
    })
    .onConflictDoUpdate({
      target: aiUsage.date,
      set: {
        requests: sql`${aiUsage.requests} + 1`,
        inputTokens: sql`${aiUsage.inputTokens} + ${usage.inputTokens}`,
        cachedInputTokens: sql`${aiUsage.cachedInputTokens} + ${usage.cachedInputTokens}`,
        outputTokens: sql`${aiUsage.outputTokens} + ${usage.outputTokens}`,
        costUsd: sql`${aiUsage.costUsd} + ${cost - held}`,
        fallbackCostUsd: sql`${aiUsage.fallbackCostUsd} + ${(fallback ? cost : 0) - heldFallback}`,
      },
    })
    .returning();

  await db
    .insert(aiUsageUser)
    .values({ userId, date, requests: 1, costUsd: cost })
    .onConflictDoUpdate({
      target: [aiUsageUser.userId, aiUsageUser.date],
      set: { requests: sql`${aiUsageUser.requests} + 1`, costUsd: sql`${aiUsageUser.costUsd} + ${cost - held}` },
    });

  if (row.costUsd < dailyBudgetUsd() * ALERT_SHARE || row.alertedAt) return false;
  // Only one caller wins the update, so the alert fires once per day.
  const claimed = await db
    .update(aiUsage)
    .set({ alertedAt: new Date() })
    .where(sql`${aiUsage.date} = ${date} and ${aiUsage.alertedAt} is null`)
    .returning({ date: aiUsage.date });
  return claimed.length > 0;
}
