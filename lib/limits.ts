import { eq, sql } from "drizzle-orm";
import { aiUsage, db, usageCounters } from "@/db";
import { numberEnv } from "./env";

// Free tier guards: a per-user daily message cap and a global daily OpenAI spend ceiling.

export const DAILY_MESSAGE_LIMIT = 150; // ASSUMPTION from the spec interview; tune with real usage.

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

// Prices per million tokens of the parser model. ASSUMPTION: set the real values for the configured
// model via env; the defaults are deliberately on the high side so the ceiling trips early, not late.
const priceInput = () => numberEnv("OPENAI_PRICE_INPUT_USD_PER_MTOK", 1);
const priceOutput = () => numberEnv("OPENAI_PRICE_OUTPUT_USD_PER_MTOK", 6);
export const dailyBudgetUsd = () => numberEnv("OPENAI_DAILY_BUDGET_USD", 5);
const ALERT_SHARE = 0.8;

const utcDate = (now = new Date()) => now.toISOString().slice(0, 10);

export class BudgetExceededError extends Error {
  constructor() {
    super("OpenAI daily budget exceeded");
  }
}

export async function assertAiBudget() {
  const row = await db.query.aiUsage.findFirst({ where: eq(aiUsage.date, utcDate()) });
  if (row && row.costUsd >= dailyBudgetUsd()) throw new BudgetExceededError();
}

/** Records one OpenAI call. Returns true the first time the day crosses the alert threshold. */
export async function recordAiUsage(inputTokens: number, outputTokens: number) {
  const cost = (inputTokens * priceInput() + outputTokens * priceOutput()) / 1_000_000;
  const date = utcDate();
  const [row] = await db
    .insert(aiUsage)
    .values({ date, requests: 1, inputTokens, outputTokens, costUsd: cost })
    .onConflictDoUpdate({
      target: aiUsage.date,
      set: {
        requests: sql`${aiUsage.requests} + 1`,
        inputTokens: sql`${aiUsage.inputTokens} + ${inputTokens}`,
        outputTokens: sql`${aiUsage.outputTokens} + ${outputTokens}`,
        costUsd: sql`${aiUsage.costUsd} + ${cost}`,
      },
    })
    .returning();

  if (row.costUsd < dailyBudgetUsd() * ALERT_SHARE || row.alertedAt) return false;
  // Only one caller wins the update, so the alert fires once per day.
  const claimed = await db
    .update(aiUsage)
    .set({ alertedAt: new Date() })
    .where(sql`${aiUsage.date} = ${date} and ${aiUsage.alertedAt} is null`)
    .returning({ date: aiUsage.date });
  return claimed.length > 0;
}
