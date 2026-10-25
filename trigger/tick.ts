import { idempotencyKeys, schedules } from "@trigger.dev/sdk";
import { and, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db, reminderLog, sessions, telegramLinks, users } from "@/db";
import { isReminderDue, localTime } from "@/lib/engine/reminders";
import { INACTIVITY_MINUTES } from "@/lib/engine/session";
import { planView } from "@/lib/services/reports";
import { loadRoutine } from "@/lib/services/routine";
import { findOpenSession, nextRoutineDay } from "@/lib/services/workout";
import { sendMessage, TelegramError } from "@/lib/telegram/client";
import * as render from "@/lib/telegram/render";
import { enqueue } from "@/lib/trace";
import { closeInactiveSession } from "./close-session";
import { errorAttrs, log } from "./log";

/**
 * Global 5-minute tick: closes idle sessions and sends training-day reminders. Safe to run twice:
 * session closes are deduped by idempotency key and reminders by the (user, local date) row.
 */
export const tick = schedules.task({
  id: "tick",
  cron: "*/5 * * * *",
  maxDuration: 240,
  run: async (payload) => {
    const now = payload.timestamp;
    const closes = await closeIdleSessions(now);
    const reminders = await sendReminders(now);
    // Runs every 5 minutes: only ticks that did something are worth a log.
    if (closes || reminders.sent || reminders.failed || reminders.blocked) {
      log.info("Tick done", {
        sessions_closed: closes,
        reminders_sent: reminders.sent,
        reminders_failed: reminders.failed,
        reminders_blocked: reminders.blocked,
      });
    }
    return { closes, reminders };
  },
});

async function closeIdleSessions(now: Date) {
  const cutoff = new Date(now.getTime() - INACTIVITY_MINUTES * 60_000);
  const idle = await db
    .select({ id: sessions.id, userId: sessions.userId })
    .from(sessions)
    .where(and(isNull(sessions.endedAt), lt(sql`coalesce(${sessions.lastSetAt}, ${sessions.startedAt})`, cutoff)));
  if (idle.length === 0) return 0;

  const items = await Promise.all(
    idle.map(async (s) => ({
      payload: { sessionId: s.id },
      options: {
        idempotencyKey: await idempotencyKeys.create(`close-${s.id}`, { scope: "global" }),
        concurrencyKey: s.userId,
        tags: [`user_${s.userId}`],
      },
    })),
  );
  await enqueue("close-inactive-session", ({ metadata }) =>
    closeInactiveSession.batchTrigger(items.map((item) => ({ ...item, options: { ...item.options, metadata } }))),
  );
  return idle.length;
}

async function sendReminders(now: Date) {
  const candidates = await db
    .select({ user: users, chatId: telegramLinks.chatId })
    .from(users)
    .innerJoin(telegramLinks, eq(telegramLinks.userId, users.id))
    .where(and(isNotNull(users.reminderTime), sql`cardinality(${users.trainingDays}) > 0`));

  let sent = 0;
  let failed = 0;
  let blocked = 0;
  for (const { user, chatId } of candidates) {
    const local = localTime(now, user.timezone);
    if (!isReminderDue(local, user.reminderTime!, user.trainingDays)) continue;

    // Already training, or trained earlier today: no reminder.
    // Local midnight (timezone offsets are whole minutes, so seconds match UTC).
    const dayStart = new Date(now.getTime() - local.minutes * 60_000 - (now.getTime() % 60_000));
    const [open, today] = await Promise.all([
      findOpenSession(user.id),
      db.query.sessions.findFirst({ where: and(eq(sessions.userId, user.id), gte(sessions.startedAt, dayStart)) }),
    ]);
    if (open || today) continue;

    // Claim the (user, date) slot first; only the run that inserts the row sends.
    const claimed = await db.insert(reminderLog).values({ userId: user.id, date: local.date }).onConflictDoNothing().returning();
    if (claimed.length === 0) continue;

    try {
      const routine = await loadRoutine(user.id);
      await sendMessage(chatId, render.reminder(await planView(user.id, await nextRoutineDay(user.id, routine))));
      sent++;
    } catch (err) {
      if (err instanceof TelegramError && err.isBlocked) {
        blocked++;
        continue; // keep the row: do not retry a blocked chat today
      }
      // Release the slot so the next tick retries.
      await db.delete(reminderLog).where(and(eq(reminderLog.userId, user.id), eq(reminderLog.date, local.date)));
      failed++;
      log.warn("Reminder failed, will retry next tick", { user_id: user.id, ...errorAttrs(err) });
    }
  }
  return { sent, failed, blocked };
}
