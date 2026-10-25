import "../db/env";
import { callTelegram } from "../lib/telegram/client";

// Points the bot (TELEGRAM_BOT_TOKEN) at <base url>/api/telegram/webhook and registers its commands.
// Usage: npm run telegram:webhook -- https://<ngrok-or-vercel-domain>
// Use separate bots (tokens) for dev and prod: each bot has exactly one webhook.

async function main() {
  const base = (process.argv[2] ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  if (!base.startsWith("https://")) throw new Error("Pass the public https base URL, e.g. npm run telegram:webhook -- https://abc.ngrok-free.app");
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !/^[A-Za-z0-9_-]{16,256}$/.test(secret)) throw new Error("TELEGRAM_WEBHOOK_SECRET must be 16–256 chars of A-Z, a-z, 0-9, _ or -");

  const url = `${base}/api/telegram/webhook`;
  await callTelegram("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    max_connections: 40,
  });
  await callTelegram("setMyCommands", {
    commands: [
      { command: "treino", description: "Próximo treino e metas" },
      { command: "terminei", description: "Encerrar o treino e ver o resumo" },
      { command: "semana", description: "Resumo dos últimos 7 dias" },
      { command: "ajuda", description: "Como registrar séries" },
    ],
    language_code: "pt",
  });

  const info = await callTelegram<{ url: string; pending_update_count: number; last_error_message?: string }>("getWebhookInfo", {});
  console.log(
    `Webhook set: ${info.url} (pending: ${info.pending_update_count})${info.last_error_message ? ` — last error: ${info.last_error_message}` : ""}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
