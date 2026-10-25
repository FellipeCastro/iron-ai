import * as Sentry from "@sentry/node";
import { AbortTaskRunError, concurrencyLimit, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { handleUpdate } from "@/lib/bot/handle-update";
import type { TgUpdate } from "@/lib/telegram/client";
import { log } from "./log";

// One run at a time per user (concurrencyKey = user id, or chat id before linking) across every task
// that touches a user's workout, so messages, button taps and the inactivity close never interleave.
export const userChat = concurrencyLimit({ name: "user-chat", perKey: 1 });

const MAX_ATTEMPTS = 3;
const REQUIRED_ENV = ["DATABASE_URL", "TELEGRAM_BOT_TOKEN", "OPENAI_API_KEY"];

export const handleTelegramUpdate = schemaTask({
  id: "telegram-handle-update",
  concurrency: userChat,
  retry: { maxAttempts: MAX_ATTEMPTS },
  // Only the fields the handler reads; Telegram's update object is much larger.
  schema: z.object({ update: z.custom<TgUpdate>((v) => typeof v === "object" && v !== null && "update_id" in v) }),
  run: async ({ update }, { ctx }) => {
    // Fail before touching the `messages` row: once it is marked processed, a retry is skipped as a duplicate.
    const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
    if (missing.length) throw new AbortTaskRunError(`Missing env in the Trigger.dev worker: ${missing.join(", ")} (restart \`trigger.dev dev\`)`);

    const startedAt = Date.now();
    const result = await handleUpdate(update, {
      isLastAttempt: ctx.attempt.number >= MAX_ATTEMPTS,
      log: (level, message, data) => log[level](message, { update_id: update.update_id, ...data }),
      report: (err) => Sentry.captureException(err),
    });
    // One wide event per update: what came in, what the parser made of it and what it cost.
    log.info("Telegram update handled", {
      update_id: update.update_id,
      user_id: result.userId,
      status: result.status,
      kind: result.kind,
      command: result.command,
      link_error: result.linkError,
      intent: result.intent,
      confidence: result.confidence,
      ai_model: result.model,
      ai_fallback: result.fallback,
      ai_input_tokens: result.inputTokens,
      ai_output_tokens: result.outputTokens,
      duration_ms: Date.now() - startedAt,
    });
    return result;
  },
});
