import { schedules } from "@trigger.dev/sdk";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, reportLog, subscriptions, telegramLinks, users } from "@/db";
import { dueReports, periodsFor } from "@/lib/engine/periods";
import { localTime } from "@/lib/engine/reminders";
import { ACCESS_STATUSES } from "@/lib/services/access";
import { periodReportText } from "@/lib/services/reports";
import { sendMessage, TelegramError } from "@/lib/telegram/client";
import { errorAttrs, log } from "./log";

/**
 * Weekly report every Sunday evening (local time), plus the monthly one on the first Sunday of the month.
 * Runs hourly: each user's 20:00 falls in some hour's run, and a late run still sends the same night.
 * Safe to run twice: the (user, kind, period) row is claimed before sending.
 */
export const reports = schedules.task({
  id: "periodic-reports",
  cron: "0 * * * *",
  machine: "micro",
  maxDuration: 240,
  run: async (payload) => {
    const now = payload.timestamp;
    const candidates = await db
      .select({ user: users, chatId: telegramLinks.chatId })
      .from(users)
      .innerJoin(telegramLinks, eq(telegramLinks.userId, users.id))
      .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
      // Same audience as the reminders: complimentary accounts and paid subscriptions.
      .where(or(eq(users.complimentary, true), inArray(subscriptions.status, ACCESS_STATUSES)));

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    let blocked = 0;
    for (const { user, chatId } of candidates) {
      const local = localTime(now, user.timezone);
      for (const kind of dueReports(local)) {
        const { current } = periodsFor(kind, local.date, user.timezone);
        const claimed = await db.insert(reportLog).values({ userId: user.id, kind, period: current.from }).onConflictDoNothing().returning();
        if (claimed.length === 0) continue;

        try {
          const text = await periodReportText(user, kind, local.date);
          if (!text) {
            skipped++; // no training in the period: keep the row so later runs don't recompute
            continue;
          }
          await sendMessage(chatId, text);
          sent++;
        } catch (err) {
          if (err instanceof TelegramError && err.isBlocked) {
            blocked++;
            continue; // keep the row: do not retry a blocked chat
          }
          // Release the claim so the next run retries.
          await db.delete(reportLog).where(and(eq(reportLog.userId, user.id), eq(reportLog.kind, kind), eq(reportLog.period, current.from)));
          failed++;
          log.warn("Report failed, will retry next run", { user_id: user.id, kind, ...errorAttrs(err) });
        }
      }
    }

    if (sent || skipped || failed || blocked) {
      log.info("Reports done", { reports_sent: sent, reports_skipped: skipped, reports_failed: failed, reports_blocked: blocked });
    }
    return { sent, skipped, failed, blocked };
  },
});
