import { markSummarySent } from "@/lib/services/workout";
import { editMessageText, sendMessage, type InlineKeyboard } from "@/lib/telegram/client";

// How the bot's replies reach the chat. Every flow returns `Out[]`; only this module talks to Telegram for them.

/** One reply: its text, an optional inline keyboard, and the session whose summary it is (marked as sent on delivery). */
export type Out = { text: string; keyboard?: InlineKeyboard; sessionId?: string };

/** Sends replies in order; after a button tap the first one replaces the message that had the keyboard. */
export async function deliver(userId: string, chatId: number, outs: Out[], editMessageId?: number) {
  for (const [i, out] of outs.entries()) {
    // Editing fails for old or unchanged messages; the reply still has to arrive, so send it instead.
    const edited = i === 0 && editMessageId ? await editMessageText(chatId, editMessageId, out.text, out.keyboard).catch(() => null) : null;
    if (!edited) await sendMessage(chatId, out.text, out.keyboard);
    if (out.sessionId) await markSummarySent(userId, out.sessionId);
  }
}
