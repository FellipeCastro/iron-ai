import { and, eq, gte, sql } from "drizzle-orm";
import { aiUsage, aiUsageUser, db, usageCounters } from "@/db/client";
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
  return { date, userId, usd, fallbackUsd: 0 };
}

/** Reserves `usd` against today's fallback ceiling. False when it is already spent (the fallback bills ~7x the primary). */
export async function reserveFallback(reservation: AiReservation, usd: number) {
  const [row] = await db
    .update(aiUsage)
    .set({ fallbackCostUsd: sql`${aiUsage.fallbackCostUsd} + ${usd}` })
    .where(and(eq(aiUsage.date, reservation.date), sql`${aiUsage.fallbackCostUsd} < ${fallbackDailyBudgetUsd()}`))
    .returning({ date: aiUsage.date });
  if (!row) return false;
  reservation.fallbackUsd += usd;
  return true;
}

/** Gives a reservation back when the call did not happen or failed. Do not call it after recordAiUsage. */
export async function releaseAiBudget(reservation: AiReservation) {
  const { date, userId, usd, fallbackUsd } = reservation;
  await db.batch([
    db
      .update(aiUsage)
      .set({ costUsd: sql`${aiUsage.costUsd} - ${usd}`, fallbackCostUsd: sql`${aiUsage.fallbackCostUsd} - ${fallbackUsd}` })
      .where(eq(aiUsage.date, date)),
    db
      .update(aiUsageUser)
      .set({ costUsd: sql`${aiUsageUser.costUsd} - ${usd}` })
      .where(and(eq(aiUsageUser.userId, userId), eq(aiUsageUser.date, date))),
  ]);
}

/**
 * Records one OpenAI call and settles its reservation (the estimate is replaced by the real cost, on the day it was
 * reserved). Returns true the first time the day crosses the alert threshold.
 */
export async function recordAiUsage(userId: string, model: string, usage: TokenUsage, fallback: boolean, reservation?: AiReservation) {
  const cost = aiCostUsd(model, usage);
  const date = reservation?.date ?? utcDate();
  const held = reservation?.usd ?? 0;
  const heldFallback = reservation?.fallbackUsd ?? 0;
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
