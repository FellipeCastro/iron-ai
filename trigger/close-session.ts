import { logger, retry, task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { db, sessions } from "@/db";
import { isInactive } from "@/lib/engine/session";
import { loadRoutine } from "@/lib/services/routine";
import { closeSession, markSummarySent } from "@/lib/services/workout";
import { sendMessage, TelegramError } from "@/lib/telegram/client";
import * as render from "@/lib/telegram/render";
import { userChat } from "./handle-message";

export type CloseSessionPayload = { sessionId: string };

/** Closes a session idle for 90 minutes and sends the summary. Triggered by the tick cron. */
export const closeInactiveSession = task({
  id: "close-inactive-session",
  concurrency: userChat,
  run: async ({ sessionId }: CloseSessionPayload) => {
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
      with: { user: { with: { telegramLink: true } } },
    });
    // A set may have arrived between the cron query and this run (same per-user queue as messages).
    if (!session || session.endedAt || !isInactive(session.lastSetAt ?? session.startedAt, new Date())) {
      return { closed: false };
    }

    const closed = await closeSession(session.user, sessionId, "inactive", await loadRoutine(session.userId));
    const chatId = session.user.telegramLink?.chatId;
    if (!closed || !chatId) return { closed: Boolean(closed), notified: false };

    // The close already happened, so a task retry would find nothing to do: retry just the send.
    const text = render.summary({ closeReason: "inactive", day: closed.day, data: closed.data, next: closed.next });
    try {
      await retry.onThrow(() => sendMessage(chatId, text), { maxAttempts: 3 });
      await markSummarySent(sessionId);
      return { closed: true, notified: true };
    } catch (err) {
      logger.warn(err instanceof TelegramError && err.isBlocked ? "User blocked the bot" : "Summary not delivered", {
        sessionId,
        error: String(err),
      });
      return { closed: true, notified: false };
    }
  },
});
