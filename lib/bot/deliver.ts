import { setRepliesSent } from "@/lib/services/messages";
import { markSummarySent } from "@/lib/services/workout";
import { editMessageText, sendMessage, type InlineKeyboard } from "@/lib/telegram/client";

// How the bot's replies reach the chat. Every flow returns `Out[]`; only this module talks to Telegram for them.

/** One reply: its text, an optional inline keyboard, and the session whose summary it is (marked as sent on delivery). */
export type Out = { text: string; keyboard?: InlineKeyboard; sessionId?: string };

/**
 * Sends replies in order, starting at `from`; after a button tap the first one replaces the message that had the
 * keyboard. The replies were saved on the update's `messages` row when it was finished, and progress is saved
 * after each one, so a retried run resumes at the first unsent reply (see handleUpdate).
 */
export async function deliver(updateId: number, userId: string | null | undefined, chatId: number, outs: Out[], from = 0, editMessageId?: number) {
  for (let i = from; i < outs.length; i++) {
    const out = outs[i];
    // Editing fails for old or unchanged messages; the reply still has to arrive, so send it instead.
    const edited = i === 0 && editMessageId ? await editMessageText(chatId, editMessageId, out.text, out.keyboard).catch(() => null) : null;
    if (!edited) await sendMessage(chatId, out.text, out.keyboard);
    if (out.sessionId && userId) await markSummarySent(userId, out.sessionId);
    await setRepliesSent(updateId, i + 1);
  }
}
