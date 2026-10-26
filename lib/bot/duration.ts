import { eq } from "drizzle-orm";
import { db, telegramLinks } from "@/db";
import type { ClosedSession } from "@/lib/services/workout";
import type { InlineKeyboard } from "@/lib/telegram/client";
import { durationKeyboard } from "@/lib/telegram/keyboards";
import * as render from "@/lib/telegram/render";
import { newPendingId } from "@/lib/telegram/state";

/**
 * Asks the user to confirm (or edit) the duration of a session that just closed. Stores the pending step in the
 * chat state, so the buttons and the typed correction are handled by `handleUpdate`.
 */
export async function durationPrompt(userId: string, closed: ClosedSession): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const id = newPendingId();
  const minutes = closed.data.durationMin;
  await db
    .update(telegramLinks)
    .set({ chatState: { pending: { kind: "duration", id, sessionId: closed.session.id, minutes } } })
    .where(eq(telegramLinks.userId, userId));
  return { text: render.confirmDuration(minutes), keyboard: durationKeyboard(id) };
}
