import { requireEnv } from "@/lib/env";

// Thin Bot API client over fetch. Only the fields the app reads are typed.

export type TgUser = { id: number; is_bot: boolean; first_name: string; username?: string };
export type TgChat = { id: number; type: "private" | "group" | "supergroup" | "channel"; username?: string };
export type TgMessage = { message_id: number; date: number; chat: TgChat; from?: TgUser; text?: string };
export type TgCallbackQuery = { id: string; from: TgUser; message?: TgMessage; data?: string };
export type TgUpdate = { update_id: number; message?: TgMessage; edited_message?: TgMessage; callback_query?: TgCallbackQuery };

export type InlineButton = { text: string; callback_data: string } | { text: string; url: string };
export type InlineKeyboard = InlineButton[][];

export class TelegramError extends Error {
  constructor(
    readonly method: string,
    readonly code: number,
    description: string,
  ) {
    super(`Telegram ${method} failed (${code}): ${description}`);
  }

  /** The user blocked the bot or deleted the chat: retrying will never work. */
  get isBlocked() {
    return this.code === 403;
  }
}

export async function callTelegram<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${requireEnv("TELEGRAM_BOT_TOKEN")}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result: T; error_code?: number; description?: string };
  if (!json.ok) throw new TelegramError(method, json.error_code ?? res.status, json.description ?? res.statusText);
  return json.result;
}

const replyMarkup = (keyboard?: InlineKeyboard) => (keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {});

/** Messages are HTML (see render.ts `esc`), with link previews off. */
export function sendMessage(chatId: number, text: string, keyboard?: InlineKeyboard) {
  return callTelegram<TgMessage>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...replyMarkup(keyboard),
  });
}

export function editMessageText(chatId: number, messageId: number, text: string, keyboard?: InlineKeyboard) {
  return callTelegram<TgMessage | true>("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...replyMarkup(keyboard),
  });
}

export function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return callTelegram<true>("answerCallbackQuery", { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });
}

/** "digitando…" indicator; best effort, never fails the caller. */
export async function sendTyping(chatId: number) {
  await callTelegram("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined);
}
