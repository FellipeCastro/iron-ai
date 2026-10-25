import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import type { NextRequest } from "next/server";
import { localTime } from "@/lib/engine/reminders";
import { countMessage, DAILY_MESSAGE_LIMIT } from "@/lib/limits";
import { findByChat } from "@/lib/services/users";
import { sendMessage, type TgUpdate } from "@/lib/telegram/client";
import * as render from "@/lib/telegram/render";
import { enqueue } from "@/lib/trace";
import type { handleTelegramUpdate } from "@/trigger/handle-message";

// Public route: Telegram proves itself with the secret set via setWebhook (scripts/telegram-webhook.ts).
// The handler only checks limits and enqueues, so Telegram gets a fast 200 and never redelivers.

function validSecret(req: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const received = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Tags the request's root span so traces can be filtered by what happened to the update. */
function outcome(value: "unauthorized" | "bad_request" | "ignored" | "rate_limited" | "enqueued") {
  const span = Sentry.getActiveSpan();
  if (span) Sentry.getRootSpan(span).setAttribute("telegram.outcome", value);
}

export async function POST(req: NextRequest) {
  if (!validSecret(req)) {
    outcome("unauthorized");
    // A wrong or missing secret after a deploy silences the bot entirely; this is how that shows up.
    Sentry.logger.warn("Telegram webhook rejected", { reason: process.env.TELEGRAM_WEBHOOK_SECRET ? "invalid_secret" : "secret_not_configured" });
    return new Response("Unauthorized", { status: 401 });
  }

  let update: TgUpdate;
  try {
    update = await req.json();
  } catch {
    outcome("bad_request");
    return new Response("Bad request", { status: 400 });
  }

  const chat = update.message?.chat ?? update.callback_query?.message?.chat;
  if (typeof update.update_id !== "number" || !chat || chat.type !== "private") {
    outcome("ignored");
    return new Response("OK");
  }

  const link = await findByChat(chat.id);

  // Daily cap on text messages of linked users (button taps are free; unlinked chats never reach the LLM).
  if (link && update.message) {
    const count = await countMessage(link.userId, localTime(new Date(), link.user.timezone).date);
    if (count > DAILY_MESSAGE_LIMIT) {
      if (count === DAILY_MESSAGE_LIMIT + 1) {
        // Once per user and day, like the notice itself: tells whether the cap is tuned right.
        Sentry.logger.warn("Daily message limit reached", { user_id: link.userId, limit: DAILY_MESSAGE_LIMIT });
        await sendMessage(chat.id, render.rateLimited(DAILY_MESSAGE_LIMIT)).catch(() => undefined);
      }
      outcome("rate_limited");
      return new Response("OK");
    }
  }

  const key = link?.userId ?? `chat_${chat.id}`;
  const idempotencyKey = await idempotencyKeys.create(`tg-update-${update.update_id}`, { scope: "global" });
  await enqueue("telegram-handle-update", ({ metadata }) =>
    tasks.trigger<typeof handleTelegramUpdate>(
      "telegram-handle-update",
      { update: pick(update) },
      {
        // Telegram redelivers the same update_id until it gets a 2xx: one run per update, ever.
        idempotencyKey,
        concurrencyKey: key,
        tags: [link ? `user_${link.userId}` : `chat_${chat.id}`],
        metadata,
      },
    ),
  );

  outcome("enqueued");
  return new Response("OK");
}

/** Keeps only what the handler reads, so payloads stay small and carry no unneeded user data. */
function pick(update: TgUpdate): TgUpdate {
  const msg = (m: TgUpdate["message"]) =>
    m && {
      message_id: m.message_id,
      date: m.date,
      chat: { id: m.chat.id, type: m.chat.type },
      from: m.from && { id: m.from.id, is_bot: m.from.is_bot, first_name: "", username: m.from.username },
      text: m.text,
    };
  return {
    update_id: update.update_id,
    message: msg(update.message),
    callback_query: update.callback_query && {
      id: update.callback_query.id,
      from: { id: update.callback_query.from.id, is_bot: false, first_name: "" },
      data: update.callback_query.data,
      message: msg(update.callback_query.message),
    },
  };
}
