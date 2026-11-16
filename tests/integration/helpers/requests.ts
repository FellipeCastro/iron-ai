import { createHmac, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripeMock } from "./mocks";

// Monta as requisições que cada webhook recebe, assinadas como o serviço de origem assinaria.

const URL_BASE = "http://localhost:3000";

export const request = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(`${URL_BASE}${path}`, init);

// ---------- Stripe ----------

/** Evento mínimo do Stripe. `object` é o `data.object` do evento. */
export function stripeEvent(type: string, object: Record<string, unknown>, id = `evt_${randomUUID()}`) {
  return { id, object: "event", type, data: { object } } as unknown as Stripe.Event;
}

/** POST /api/webhooks/stripe com assinatura válida (`webhooks.generateTestHeaderString`). */
export function stripeWebhookRequest(event: Stripe.Event | string, opts: { secret?: string; signature?: string | null } = {}) {
  const payload = typeof event === "string" ? event : JSON.stringify(event);
  const signature =
    opts.signature === undefined
      ? stripeMock.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? process.env.STRIPE_WEBHOOK_SECRET! })
      : opts.signature;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== null) headers["stripe-signature"] = signature;
  return request("/api/webhooks/stripe", { method: "POST", body: payload, headers });
}

// ---------- Clerk (Svix) ----------

/** POST /api/webhooks/clerk assinado como o Svix: HMAC-SHA256 de `${id}.${timestamp}.${body}`. */
export function clerkWebhookRequest(
  event: { type: string; data: Record<string, unknown> },
  opts: { svixId?: string; secret?: string; tamper?: boolean } = {},
) {
  const svixId = opts.svixId ?? `msg_${randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ object: "event", ...event });
  const secret = opts.secret ?? process.env.CLERK_WEBHOOK_SIGNING_SECRET!;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key).update(`${svixId}.${timestamp}.${body}`).digest("base64");
  return request("/api/webhooks/clerk", {
    method: "POST",
    body: opts.tamper ? body.replace("user_", "usr_") : body,
    headers: { "content-type": "application/json", "svix-id": svixId, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` },
  });
}

// ---------- Telegram ----------

let updateId = 1000;

/** POST /api/telegram/webhook com o segredo correto (`secret: null` omite o header). */
export function telegramWebhookRequest(update: Record<string, unknown> | string, opts: { secret?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = opts.secret === undefined ? process.env.TELEGRAM_WEBHOOK_SECRET : opts.secret;
  if (secret) headers["x-telegram-bot-api-secret-token"] = secret;
  return request("/api/telegram/webhook", { method: "POST", body: typeof update === "string" ? update : JSON.stringify(update), headers });
}

/** Update de mensagem de texto num chat privado. */
export function telegramTextUpdate(chatId: number, text: string, id = ++updateId) {
  return {
    update_id: id,
    message: { message_id: id, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: "private" }, from: { id: chatId, is_bot: false, first_name: "Teste" }, text },
  };
}

/** Update de toque em botão inline. */
export function telegramCallbackUpdate(chatId: number, data: string, id = ++updateId) {
  return {
    update_id: id,
    callback_query: {
      id: `cb_${id}`,
      from: { id: chatId, is_bot: false, first_name: "Teste" },
      data,
      message: { message_id: id, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: "private" } },
    },
  };
}
