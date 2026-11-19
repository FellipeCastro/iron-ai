import { schedules } from "@trigger.dev/sdk";
import { lt, or, isNotNull } from "drizzle-orm";
import { db, idempotentRequests, linkTokens, messages, reminderLog, reportLog, stripeEvents, usageCounters } from "@/db/client";
import { log } from "./log";

const DAY = 86_400_000;
const RAW_TEXT_DAYS = 30;
const COUNTERS_DAYS = 90;
// Stripe redelivers an event for up to 3 days; the claim is kept well past that.
const STRIPE_EVENT_DAYS = 90;

/** Daily retention: raw Telegram text lives 30 days; old tokens, counters and idempotency records go too. */
export const purge = schedules.task({
  id: "purge",
  machine: "micro",
  cron: { pattern: "0 4 * * *", timezone: "America/Sao_Paulo" },
  run: async (payload) => {
    const now = payload.timestamp.getTime();
    const counterCutoff = new Date(now - COUNTERS_DAYS * DAY).toISOString().slice(0, 10);

    const [msgs, tokens, counters, reminders, reportRows, stripeRows, idempotencyRows] = await Promise.all([
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
      db.delete(reportLog).where(lt(reportLog.period, counterCutoff)).returning({ period: reportLog.period }),
      db
        .delete(stripeEvents)
        .where(lt(stripeEvents.receivedAt, new Date(now - STRIPE_EVENT_DAYS * DAY)))
        .returning({ id: stripeEvents.eventId }),
      db
        .delete(idempotentRequests)
        .where(lt(idempotentRequests.createdAt, new Date(now - DAY)))
        .returning({ key: idempotentRequests.key }),
    ]);

    const result = {
      messages: msgs.length,
      linkTokens: tokens.length,
      usageCounters: counters.length,
      reminderLog: reminders.length,
      reportLog: reportRows.length,
      stripeEvents: stripeRows.length,
      idempotentRequests: idempotencyRows.length,
    };
    // Retention audit: proves the 30-day raw-text deletion ran and how much it removed.
    log.info("Purge done", {
      messages_deleted: result.messages,
      link_tokens_deleted: result.linkTokens,
      usage_counters_deleted: result.usageCounters,
      reminder_log_deleted: result.reminderLog,
      report_log_deleted: result.reportLog,
      stripe_events_deleted: result.stripeEvents,
      idempotent_requests_deleted: result.idempotentRequests,
    });
    return result;
  },
});
