import { loadCtx, parserContext, pool, saveState } from "@/lib/bot/context";
import { handleCallback } from "@/lib/bot/callbacks";
import { handleCommand } from "@/lib/bot/commands";
import { deliver, type Out } from "@/lib/bot/deliver";
import { execute } from "@/lib/bot/intents";
import { handleAwaitedText } from "@/lib/bot/onboarding";
import { fastParse, fastPathMode, sameIntent } from "@/lib/ai/fast-parse";
import { parseMessage, type ParseResult } from "@/lib/ai/parse-message";
import { MAX_VOICE_SECONDS, transcribeVoice, voiceTooLong } from "@/lib/ai/transcribe";
import type { Intent } from "@/lib/ai/schemas";
import { BudgetExceededError, UserBudgetExceededError } from "@/lib/limits";
import { userHasAccess } from "@/lib/services/access";
import { loadRoutine } from "@/lib/services/routine";
import { claimMessage, findMessage, finishMessage, setMessageRawText, setMessageUser } from "@/lib/services/messages";
import { consumeLinkToken, findByChat } from "@/lib/services/users";
import { updateAlreadyLogged } from "@/lib/services/workout";
import { answerCallbackQuery, sendMessage, sendTyping, type TgUpdate } from "@/lib/telegram/client";
import * as render from "@/lib/telegram/render";

export { CONFIRM_BELOW } from "@/lib/bot/intents";

// Conversation flow for one Telegram update. The LLM only turns text into an Intent; everything after
// that (exercise matching, progression, records, replies) is deterministic code and templates.

const FAST_PATH_MODEL = "fast-path";

export type HandleOptions = {
  isLastAttempt: boolean;
  log: (level: "warn" | "error", msg: string, data?: Record<string, string | number | boolean>) => void;
  /** Handled failures that still deserve an error event, since the run itself succeeds. */
  report: (err: unknown) => void;
};
type Status = "processed" | "clarify" | "ignored" | "failed";

/** Outcome of one update; the task logs it as a single event, so it carries what explains the reply. */
export type HandleResult = {
  status: Status | "duplicate";
  kind?: "message" | "callback" | "command" | "link";
  userId?: string;
  command?: string;
  linkError?: string;
  intent?: Intent["type"];
  confidence?: number;
  model?: string;
  fallback?: boolean;
  /** served = answered by the shortcut; agree/disagree = shadow comparison against the model. */
  fastPath?: "served" | "agree" | "disagree";
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
};

/** Entry point used by the trigger task. Idempotent per `update_id` (see the `messages` row guard). */
export async function handleUpdate(update: TgUpdate, opts: HandleOptions): Promise<HandleResult> {
  const message = update.message ?? update.edited_message;
  const callback = update.callback_query;
  const chat = message?.chat ?? callback?.message?.chat;
  if (!chat || chat.type !== "private") return { status: "ignored" };
  // Edits are not re-applied: the log is append-only and corrections are explicit.
  if (update.edited_message) return { status: "ignored" };

  const link = await findByChat(chat.id);
  const finish = (status: Status, parsedJson?: unknown, replies?: Out[]) => finishMessage(update.update_id, status, parsedJson, replies);
  // The replies are saved with the final status, so a run that fails while sending them is retried from delivery.
  const finishAndDeliver = async (userId: string, outs: Out[], status: Status = "processed", parsedJson?: unknown) => {
    await finish(status, parsedJson, outs);
    await deliver(update.update_id, userId, chat.id, outs);
  };
  const claimed = await claimMessage({ updateId: update.update_id, userId: link?.userId ?? null, rawText: message?.text ?? callback?.data ?? null });
  if (!claimed) {
    const existing = await findMessage(update.update_id);
    // Already handled by an earlier run (task retry or webhook redelivery): writes must not happen twice. Only the
    // replies that run saved but did not get to send are delivered, starting at the first unsent one.
    if (existing && existing.status !== "received") {
      const replies = (existing.replies as Out[] | null) ?? [];
      if (existing.repliesSent < replies.length) {
        await deliver(update.update_id, existing.userId, chat.id, replies, existing.repliesSent, callback?.message?.message_id);
      }
      return { status: "duplicate", userId: link?.userId };
    }
    // The webhook admitted (and counted) this update for another account than the one the chat resolves to now
    // (chat relinked or unlinked in between): nothing may be written on the wrong account's behalf.
    if (existing?.userId && existing.userId !== link?.userId) {
      await finish("ignored");
      return { status: "ignored", userId: link?.userId };
    }
  }

  if (callback) {
    if (!link) {
      await answerCallbackQuery(callback.id);
      await finish("ignored");
      return { status: "ignored", kind: "callback" };
    }
    if (!(await userHasAccess(link.userId))) {
      await answerCallbackQuery(callback.id).catch(() => undefined);
      await finish("ignored");
      await sendMessage(chat.id, render.subscriptionRequired());
      return { status: "ignored", kind: "callback", userId: link.userId };
    }
    const ctx = await loadCtx(update.update_id, chat.id, link.user, link.chatState);
    const outs = await handleCallback(ctx, callback.data);
    await finish("processed", undefined, outs);
    await answerCallbackQuery(callback.id).catch(() => undefined);
    await deliver(update.update_id, ctx.user.id, chat.id, outs, 0, callback.message?.message_id);
    return { status: "processed", kind: "callback", userId: link.userId };
  }

  let text = message?.text?.trim();
  const voice = message?.voice ?? message?.audio;
  if (!text && !voice) {
    await finish("ignored");
    await sendMessage(chat.id, render.nonText());
    return { status: "ignored", kind: "message", userId: link?.userId };
  }

  // /start <token> links the chat; works whether or not this chat is already linked.
  const start = text?.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{16,64}))?$/);
  if (start?.[1]) {
    const result = await consumeLinkToken(start[1], chat.id, message?.from?.username ?? null);
    await finish("processed");
    if (!result.ok) {
      await sendMessage(chat.id, result.reason === "chat_taken" ? render.linkChatTaken() : render.linkInvalid());
      return { status: "processed", kind: "link", linkError: result.reason };
    }
    await setMessageUser(update.update_id, result.userId);
    await sendMessage(chat.id, render.linked(Boolean(await loadRoutine(result.userId))));
    return { status: "processed", kind: "link", userId: result.userId };
  }

  if (!link) {
    await finish("ignored");
    await sendMessage(chat.id, render.notLinked());
    return { status: "ignored", kind: "message" };
  }

  // No subscription: nothing runs (and no model call is paid for). Linking above still works.
  if (!(await userHasAccess(link.userId))) {
    await finish("ignored");
    await sendMessage(chat.id, render.subscriptionRequired());
    return { status: "ignored", kind: "message", userId: link.userId };
  }

  // Voice notes are transcribed only now, after linking and access checks, so no one else costs a model call.
  if (!text && voice) {
    if (voiceTooLong(voice)) {
      await finish("ignored");
      await sendMessage(chat.id, render.audioTooLong(MAX_VOICE_SECONDS));
      return { status: "ignored", kind: "message", userId: link.userId };
    }
    await sendTyping(chat.id);
    try {
      text = await transcribeVoice(voice, link.userId);
    } catch (err) {
      return failedModelCall(err, "Transcription failed on last attempt", { userId: link.userId, chatId: chat.id, opts, finish });
    }
    if (!text) {
      await finish("clarify");
      await sendMessage(chat.id, render.audioUnclear());
      return { status: "clarify", kind: "message", userId: link.userId };
    }
    await setMessageRawText(update.update_id, text);
  }
  if (!text) return { status: "ignored", kind: "message", userId: link.userId };

  const ctx = await loadCtx(update.update_id, chat.id, link.user, link.chatState);

  // A durable marker means an earlier run already wrote this update's sets: skip parsing (no model call, no
  // second log) and let updateAlreadyLogged finish any target rebuild that run did not complete.
  if (await updateAlreadyLogged(update.update_id, link.userId)) {
    await finishAndDeliver(ctx.user.id, [{ text: render.alreadyLogged() }]);
    return { status: "processed", kind: "message", userId: link.userId };
  }

  // Steps that wait for typed text (training time, corrected duration) consume the message.
  if (ctx.state.pending && !text.startsWith("/")) {
    const awaited = await handleAwaitedText(ctx, ctx.state.pending, text);
    if (awaited) {
      await finishAndDeliver(ctx.user.id, awaited);
      return { status: "processed", kind: "message", userId: link.userId };
    }
  }

  // A new message abandons whatever was waiting for a button.
  if (ctx.state.pending) await saveState(ctx, { pending: null });

  const command = await handleCommand(ctx, text);
  if (command) {
    await finishAndDeliver(ctx.user.id, command);
    return { status: "processed", kind: "command", userId: link.userId, command: text.match(/^\/(\w+)/)?.[1]?.toLowerCase() };
  }

  await sendTyping(chat.id);
  const mode = fastPathMode();
  // Shortcut for plain messages ("supino 3x10 20kg", "terminei"): no model call, so it also keeps working
  // when a budget is spent. In shadow mode it only observes: the model still answers.
  const fast = mode === "off" ? null : await fastParse(text, () => pool(ctx));
  let fastPath: HandleResult["fastPath"];
  let parsed: ParseResult;
  if (fast && mode === "on") {
    parsed = { parsed: fast.parsed, model: FAST_PATH_MODEL, fallback: false, usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }, budgetAlert: false };
    fastPath = "served";
  } else {
    try {
      parsed = await parseMessage(text, await parserContext(ctx), link.userId);
    } catch (err) {
      return failedModelCall(err, "Parser failed on last attempt", { userId: link.userId, chatId: chat.id, opts, finish });
    }
    if (fast) {
      fastPath = sameIntent(fast, parsed.parsed, await pool(ctx)) ? "agree" : "disagree";
      if (fastPath === "disagree") {
        opts.log("warn", "Fast path disagrees with the model", { user_id: link.userId, fast_intent: fast.parsed.intent.type, model_intent: parsed.parsed.intent.type });
      }
    }
  }
  if (parsed.budgetAlert) opts.log("warn", "OpenAI spend crossed the alert threshold", { model: parsed.model });

  const outs = await execute(ctx, parsed.parsed.intent, {}, parsed.parsed.confidence, false);
  const status = parsed.parsed.intent.type === "clarify" ? "clarify" : "processed";
  await finishAndDeliver(ctx.user.id, outs, status, { ...parsed.parsed, model: parsed.model });
  return {
    status,
    kind: "message",
    userId: link.userId,
    intent: parsed.parsed.intent.type,
    confidence: parsed.parsed.confidence,
    model: parsed.model,
    fallback: parsed.fallback,
    fastPath,
    inputTokens: parsed.usage.inputTokens,
    cachedInputTokens: parsed.usage.cachedInputTokens,
    outputTokens: parsed.usage.outputTokens,
  };
}

/**
 * A model call (transcription or parsing) threw. A spent budget, or the last attempt, answers the user and ends the
 * update as failed; any other error is rethrown so the task retries. `failureLog` is the last-attempt log message.
 */
async function failedModelCall(
  err: unknown,
  failureLog: string,
  { userId, chatId, opts, finish }: { userId: string; chatId: number; opts: HandleOptions; finish: (status: Status) => Promise<unknown> },
): Promise<HandleResult> {
  const budget = err instanceof BudgetExceededError;
  const userBudget = err instanceof UserBudgetExceededError;
  if (!budget && !userBudget && !opts.isLastAttempt) throw err; // let the task retry
  if (budget || userBudget) {
    opts.log("error", budget ? "OpenAI daily budget exceeded" : "OpenAI per-user daily budget exceeded", { user_id: userId });
  } else {
    opts.log("error", failureLog, { user_id: userId });
    opts.report(err);
  }
  await finish("failed");
  await sendMessage(chatId, userBudget ? render.rateLimited() : render.unavailable());
  return { status: "failed", kind: "message", userId };
}
