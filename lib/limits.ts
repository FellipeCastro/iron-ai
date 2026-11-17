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

/** Throws when the global or the user's daily ceiling is hit. */
export async function assertAiBudget(userId: string) {
  const date = utcDate();
  const [global, user] = await Promise.all([
    db.query.aiUsage.findFirst({ where: eq(aiUsage.date, date) }),
    db.query.aiUsageUser.findFirst({ where: and(eq(aiUsageUser.userId, userId), eq(aiUsageUser.date, date)) }),
  ]);
  if (global && global.costUsd >= dailyBudgetUsd()) throw new BudgetExceededError();
  if (user && user.costUsd >= userDailyBudgetUsd()) throw new UserBudgetExceededError();
}

/** Whether today's fallback spend is still under its own ceiling. */
export async function fallbackAllowed() {
  const row = await db.query.aiUsage.findFirst({ where: eq(aiUsage.date, utcDate()) });
  return !row || row.fallbackCostUsd < fallbackDailyBudgetUsd();
}

/** Records one OpenAI call. Returns true the first time the day crosses the alert threshold. */
export async function recordAiUsage(userId: string, model: string, usage: TokenUsage, fallback: boolean) {
  const cost = aiCostUsd(model, usage);
  const date = utcDate();
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
        costUsd: sql`${aiUsage.costUsd} + ${cost}`,
        fallbackCostUsd: sql`${aiUsage.fallbackCostUsd} + ${fallback ? cost : 0}`,
      },
    })
    .returning();

  await db
    .insert(aiUsageUser)
    .values({ userId, date, requests: 1, costUsd: cost })
    .onConflictDoUpdate({
      target: [aiUsageUser.userId, aiUsageUser.date],
      set: { requests: sql`${aiUsageUser.requests} + 1`, costUsd: sql`${aiUsageUser.costUsd} + ${cost}` },
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
