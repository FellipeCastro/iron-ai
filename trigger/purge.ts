import { logger, schedules } from "@trigger.dev/sdk";
import { lt, or, isNotNull } from "drizzle-orm";
import { db, linkTokens, messages, reminderLog, usageCounters } from "@/db";

const DAY = 86_400_000;
const RAW_TEXT_DAYS = 30;
const COUNTERS_DAYS = 90;

/** Daily retention: raw Telegram text lives 30 days; old tokens and counters go too. */
export const purge = schedules.task({
  id: "purge",
  cron: { pattern: "0 4 * * *", timezone: "America/Sao_Paulo" },
  run: async (payload) => {
    const now = payload.timestamp.getTime();
    const counterCutoff = new Date(now - COUNTERS_DAYS * DAY).toISOString().slice(0, 10);

    const [msgs, tokens, counters, reminders] = await Promise.all([
      db
        .delete(messages)
        .where(lt(messages.createdAt, new Date(now - RAW_TEXT_DAYS * DAY)))
        .returning({ id: messages.id }),
      db
        .delete(linkTokens)
        .where(or(lt(linkTokens.expiresAt, new Date(now - DAY)), isNotNull(linkTokens.usedAt)))
        .returning({ id: linkTokens.id }),
      db.delete(usageCounters).where(lt(usageCounters.date, counterCutoff)).returning({ date: usageCounters.date }),
      db.delete(reminderLog).where(lt(reminderLog.date, counterCutoff)).returning({ date: reminderLog.date }),
    ]);

    const result = { messages: msgs.length, linkTokens: tokens.length, usageCounters: counters.length, reminderLog: reminders.length };
    logger.info("Purge done", result);
    return result;
  },
});
