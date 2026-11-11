import { eq } from "drizzle-orm";
import { db, messages, telegramLinks, users, type User } from "@/db";
import { fastParse, fastPathMode, sameIntent } from "@/lib/ai/fast-parse";
import { parseMessage, type ParseResult } from "@/lib/ai/parse-message";
import { MAX_VOICE_SECONDS, transcribeVoice, voiceTooLong } from "@/lib/ai/transcribe";
import type { Intent } from "@/lib/ai/schemas";
import { durationPrompt } from "@/lib/bot/duration";
import { parseDurationInput } from "@/lib/engine/duration";
import { findDayByQuery, remainingSets } from "@/lib/engine/session";
import { matchExercise, type MatchCandidate } from "@/lib/engine/match";
import { isNoReminder, parseTimeInput, parseWeekdaysInput } from "@/lib/engine/reminders";
import { BudgetExceededError, UserBudgetExceededError } from "@/lib/limits";
import { userHasAccess } from "@/lib/services/access";
import { loadCatalog, loadDay, loadRoutine, ensureCustomExercise, saveRoutine, type Routine, type RoutineDayFull } from "@/lib/services/routine";
import * as reports from "@/lib/services/reports";
import { consumeLinkToken, findByChat } from "@/lib/services/users";
import {
  closeSession,
  correctSet,
  deleteSet,
  findOpenSession,
  loadLog,
  logSets,
  markSummarySent,
  nextRoutineDay,
  setSessionDuration,
  type ClosedSession,
} from "@/lib/services/workout";
import { answerCallbackQuery, editMessageText, sendMessage, sendTyping, type InlineKeyboard, type TgUpdate } from "@/lib/telegram/client";
import { confirmKeyboard, pickKeyboard } from "@/lib/telegram/keyboards";
import * as render from "@/lib/telegram/render";
import { newPendingId, parseCallback, readChatState, stampPending, type ChatState, type Pending, type RoutineDraft } from "@/lib/telegram/state";

// Conversation flow for one Telegram update. The LLM only turns text into an Intent; everything after
// that (exercise matching, progression, records, replies) is deterministic code and templates.

export const CONFIRM_BELOW = 0.7;
const FAST_PATH_MODEL = "fast-path";
const MAX_DURATION_REPLY_CHARS = 10;

type Out = { text: string; keyboard?: InlineKeyboard; sessionId?: string };
type Ctx = { chatId: number; user: User; state: ChatState; routine: Routine | null; pool: MatchCandidate[] | null };

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
  const [row] = await db
    .insert(messages)
    .values({ updateId: update.update_id, userId: link?.userId ?? null, rawText: message?.text ?? callback?.data ?? null })
    .onConflictDoNothing({ target: messages.updateId })
    .returning({ id: messages.id });
  if (!row) {
    const existing = await db.query.messages.findFirst({ where: eq(messages.updateId, update.update_id) });
    // Already handled by an earlier run (webhook redelivery): writes must not happen twice.
    if (existing && existing.status !== "received") return { status: "duplicate", userId: link?.userId };
  }

  const finish = (status: Status, parsedJson?: unknown) =>
    db
      .update(messages)
      .set({ status, parsedJson: parsedJson ?? null })
      .where(eq(messages.updateId, update.update_id));

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
    const ctx = await loadCtx(chat.id, link.user, link.chatState);
    const outs = await handleCallback(ctx, callback.data);
    await finish("processed");
    await answerCallbackQuery(callback.id).catch(() => undefined);
    await deliver(chat.id, outs, callback.message?.message_id);
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
    await db.update(messages).set({ userId: result.userId }).where(eq(messages.updateId, update.update_id));
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
      const budget = err instanceof BudgetExceededError;
      const userBudget = err instanceof UserBudgetExceededError;
      if (!budget && !userBudget && !opts.isLastAttempt) throw err; // let the task retry
      if (budget || userBudget) {
        opts.log("error", budget ? "OpenAI daily budget exceeded" : "OpenAI per-user daily budget exceeded", { user_id: link.userId });
      } else {
        opts.log("error", "Transcription failed on last attempt", { user_id: link.userId });
        opts.report(err);
      }
      await finish("failed");
      await sendMessage(chat.id, userBudget ? render.rateLimited() : render.unavailable());
      return { status: "failed", kind: "message", userId: link.userId };
    }
    if (!text) {
      await finish("clarify");
      await sendMessage(chat.id, render.audioUnclear());
      return { status: "clarify", kind: "message", userId: link.userId };
    }
    await db.update(messages).set({ rawText: text }).where(eq(messages.updateId, update.update_id));
  }
  if (!text) return { status: "ignored", kind: "message", userId: link.userId };

  const ctx = await loadCtx(chat.id, link.user, link.chatState);

  // Steps that wait for typed text (training time, corrected duration) consume the message.
  if (ctx.state.pending && !text.startsWith("/")) {
    const awaited = await handleAwaitedText(ctx, ctx.state.pending, text);
    if (awaited) {
      await finish("processed");
      await deliver(chat.id, awaited);
      return { status: "processed", kind: "message", userId: link.userId };
    }
  }

  // A new message abandons whatever was waiting for a button.
  if (ctx.state.pending) await saveState(ctx, { pending: null });

  const command = await handleCommand(ctx, text);
  if (command) {
    await finish("processed");
    await deliver(chat.id, command);
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
      const budget = err instanceof BudgetExceededError;
      const userBudget = err instanceof UserBudgetExceededError;
      if (!budget && !userBudget && !opts.isLastAttempt) throw err; // let the task retry
      if (budget || userBudget) {
        opts.log("error", budget ? "OpenAI daily budget exceeded" : "OpenAI per-user daily budget exceeded", { user_id: link.userId });
      } else {
        opts.log("error", "Parser failed on last attempt", { user_id: link.userId });
        opts.report(err);
      }
      await finish("failed");
      await sendMessage(chat.id, userBudget ? render.rateLimited() : render.unavailable());
      return { status: "failed", kind: "message", userId: link.userId };
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
  await finish(status, { ...parsed.parsed, model: parsed.model });
  await deliver(chat.id, outs);
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

// ---------- Context ----------

async function loadCtx(chatId: number, user: User, rawState: unknown): Promise<Ctx> {
  return { chatId, user, state: readChatState(rawState), routine: await loadRoutine(user.id), pool: null };
}

/** Replaces the given parts of the chat state; what is not mentioned (e.g. the chosen day) is kept. */
async function saveState(ctx: Ctx, state: Partial<ChatState>) {
  ctx.state = stampPending({ ...ctx.state, ...state });
  await db.update(telegramLinks).set({ chatState: ctx.state }).where(eq(telegramLinks.userId, ctx.user.id));
}

const chosenLetter = (ctx: Ctx) => ctx.state.dayOverride?.letter ?? null;

/** Day being trained (open session), the one the user asked for, or the next one in the rotation. */
async function currentDay(ctx: Ctx): Promise<RoutineDayFull | null> {
  const open = await findOpenSession(ctx.user.id);
  if (open?.dayId) return loadDay(open.dayId);
  const chosen = ctx.routine?.days.find((d) => d.letter === chosenLetter(ctx));
  if (chosen) return chosen;
  return nextRoutineDay(ctx.user.id, ctx.routine);
}

async function parserContext(ctx: Ctx) {
  const [day, open] = await Promise.all([currentDay(ctx), findOpenSession(ctx.user.id)]);
  const view = await reports.planView(ctx.user.id, day);
  // Only the workout in progress counts as conversation: a finished one must not leak into a new message.
  const sessionSets = open ? await loadLog(ctx.user.id, { sessionId: open.id }) : [];
  return {
    onboarding: !ctx.routine,
    routine: (ctx.routine?.days ?? []).map((d) => ({ letter: d.letter, title: d.title, exercises: d.exercises.map((e) => e.name) })),
    today: view && {
      letter: view.letter,
      title: view.title,
      exercises: view.exercises.map((e) => ({
        name: e.name,
        target: e.targets.map((t) => `${t.position}ª série ${t.weight}kg×${t.reps}`).join(", ") || null,
      })),
    },
    sessionSets: sessionSets.slice(-8).map((s) => ({ exercise: s.exerciseName, position: s.setPosition, weight: s.weight, reps: s.reps })),
  };
}

/**
 * Matching pool: what is being trained right now first (the exercise in progress, then the others already
 * logged in this workout), then today's exercises, the rest of the routine, and the catalog. So "crucifixo"
 * right after "crucifixo invertido" stays on the same exercise instead of jumping to a catalog namesake.
 */
async function pool(ctx: Ctx) {
  if (ctx.pool) return ctx.pool;
  const [day, catalog, open] = await Promise.all([currentDay(ctx), loadCatalog(ctx.user.id), findOpenSession(ctx.user.id)]);
  const sessionSets = open ? await loadLog(ctx.user.id, { sessionId: open.id }) : [];
  const priority = new Map<string, number>();
  for (const d of ctx.routine?.days ?? []) for (const e of d.exercises) priority.set(e.exerciseId, 1);
  for (const e of day?.exercises ?? []) priority.set(e.exerciseId, 2);
  for (const s of sessionSets) priority.set(s.exerciseId, 3);
  const inProgress = sessionSets.at(-1)?.exerciseId;
  if (inProgress) priority.set(inProgress, 4);
  ctx.pool = catalog.map((c) => ({ ...c, priority: priority.get(c.id) ?? 0 }));
  return ctx.pool;
}

// ---------- Commands ----------

async function handleCommand(ctx: Ctx, text: string): Promise<Out[] | null> {
  const command = text.match(/^\/(\w+)/)?.[1]?.toLowerCase();
  switch (command) {
    case undefined:
      return null;
    case "start":
      return [{ text: ctx.routine ? render.help() : render.onboardingPrompt() }];
    case "ajuda":
    case "help":
      return [{ text: render.help() }];
    case "treino":
      return [{ text: await reports.nextWorkoutText(ctx.user, ctx.routine, chosenLetter(ctx)) }];
    case "terminei":
      return finishWorkout(ctx);
    case "semana":
    case "relatorio":
      return [{ text: await reports.weekReportText(ctx.user) }];
    default:
      return [{ text: render.help() }];
  }
}

// ---------- Intents ----------

const isWrite = (intent: Intent) => intent.type === "log_sets" || intent.type === "correct_set" || intent.type === "delete_set";

/** Exercise names in the intent that must be mapped to catalog ids, keyed by slot. */
function slots(intent: Intent): [string, string][] {
  switch (intent.type) {
    case "log_sets":
      return intent.groups.map((g, i) => [`g${i}`, g.exercise]);
    case "correct_set":
    case "delete_set":
      return intent.exercise ? [["x", intent.exercise]] : [];
    case "ask_report":
      return intent.scope === "exercise" && intent.exercise ? [["x", intent.exercise]] : [];
    default:
      return [];
  }
}

/**
 * Resolves exercise names (asking the user to pick when ambiguous), asks for confirmation when the parse
 * was unsure about a write, then applies the intent. `overrides` carries ids already chosen via buttons.
 */
async function execute(ctx: Ctx, intent: Intent, overrides: Record<string, string>, confidence: number, confirmed: boolean): Promise<Out[]> {
  const resolved = { ...overrides };
  for (const [slot, query] of slots(intent)) {
    if (resolved[slot]) continue;
    const result = matchExercise(query, await pool(ctx));
    if (result.match) {
      resolved[slot] = result.match.id;
    } else if (result.candidates.length) {
      const id = newPendingId();
      const candidates = result.candidates.map((c) => ({ id: c.id, name: c.name }));
      await saveState(ctx, { pending: { kind: "pick", id, intent, overrides, slot, candidates, confidence } });
      return [{ text: render.pickExercise(query), keyboard: pickKeyboard(id, candidates) }];
    } else {
      return [{ text: render.unknownExercise(query) }];
    }
  }

  // A message with only numbers, sent right after the last planned set of an exercise, could belong to the
  // next exercise: ask instead of guessing (the answer replaces the missing confirmation).
  if (intent.type === "log_sets") {
    for (const [i, g] of intent.groups.entries()) {
      const slot = `g${i}`;
      if (g.exercise_named || slot in overrides) continue;
      const fork = await exerciseFork(ctx, resolved[slot]);
      if (!fork) continue;
      const id = newPendingId();
      const candidates = [fork.next, fork.current];
      // Only explicit choices are kept: groups resolved automatically must be re-checked for their own fork.
      await saveState(ctx, { pending: { kind: "pick", id, intent, overrides, slot, candidates, confidence } });
      return [
        {
          text: render.askWhichExercise(fork.current.name, fork.next.name),
          keyboard: pickKeyboard(id, [{ name: `${fork.next.name} · 1ª série` }, { name: `${fork.current.name} · série extra` }]),
        },
      ];
    }
  }

  if (isWrite(intent) && !confirmed && confidence < CONFIRM_BELOW) {
    const id = newPendingId();
    await saveState(ctx, { pending: { kind: "confirm", id, intent, overrides: resolved } });
    return [{ text: await confirmText(ctx, intent, resolved), keyboard: confirmKeyboard(id, intent.type === "delete_set" ? "Apagar" : "Confirmar") }];
  }

  return apply(ctx, intent, resolved);
}

/**
 * Set only when the exercise in progress has all its planned sets done and another one of the day is still
 * pending: the two things a nameless "11x20kg" can mean.
 */
async function exerciseFork(ctx: Ctx, exerciseId: string | undefined) {
  const open = await findOpenSession(ctx.user.id);
  if (!open?.dayId || !exerciseId) return null;
  const [day, sets] = await Promise.all([loadDay(open.dayId), loadLog(ctx.user.id, { sessionId: open.id })]);
  const last = sets.at(-1);
  if (!day || !last || last.exerciseId !== exerciseId) return null;
  const missing = remainingSets(day, sets);
  const upcoming = missing[0];
  if (!upcoming || missing.some((r) => r.exerciseId === exerciseId)) return null;
  const next = day.exercises.find((e) => e.exerciseId === upcoming.exerciseId);
  return next ? { current: { id: exerciseId, name: last.exerciseName }, next: { id: next.exerciseId, name: next.name } } : null;
}

async function confirmText(ctx: Ctx, intent: Intent, ids: Record<string, string>) {
  const names = new Map((await pool(ctx)).map((c) => [c.id, c.name]));
  if (intent.type === "log_sets") {
    return render.confirmLog(
      intent.groups.map((g, i) => ({ name: names.get(ids[`g${i}`]) ?? g.exercise, weight: g.weight_kg, reps: g.reps, sets: g.sets })),
    );
  }
  if (intent.type === "correct_set") {
    return render.confirmCorrection(ids.x ? (names.get(ids.x) ?? null) : null, intent.set_number, { weight: intent.weight_kg, reps: intent.reps });
  }
  if (intent.type === "delete_set") return render.confirmDelete(ids.x ? (names.get(ids.x) ?? null) : null, intent.set_number);
  return "";
}

async function apply(ctx: Ctx, intent: Intent, ids: Record<string, string>): Promise<Out[]> {
  switch (intent.type) {
    case "log_sets": {
      const result = await logSets(
        ctx.user,
        ctx.routine,
        intent.groups.map((g, i) => ({ exerciseId: ids[`g${i}`], weight: g.weight_kg, reps: g.reps, count: g.sets })),
        new Date(),
        chosenLetter(ctx),
      );
      // The chosen day now lives in the session itself.
      if (ctx.state.dayOverride) await saveState(ctx, { dayOverride: null });
      const outs: Out[] = [];
      if (result.closedBefore) outs.push(summaryOut(result.closedBefore, "inactive"));
      outs.push({ text: render.setsLogged(result) });
      if (result.complete) {
        const closed = await closeSession(ctx.user, result.sessionId, "complete", ctx.routine);
        if (closed) outs.push(summaryOut(closed, "complete"), await durationPrompt(ctx.user.id, closed));
      }
      return outs;
    }
    case "correct_set": {
      const result = await correctSet(
        ctx.user,
        { exerciseId: ids.x ?? null, setNumber: intent.set_number },
        { weight: intent.weight_kg, reps: intent.reps },
      );
      return [{ text: result ? render.corrected(result.item) : render.nothingToCorrect() }];
    }
    case "delete_set": {
      const result = await deleteSet(ctx.user, { exerciseId: ids.x ?? null, setNumber: intent.set_number });
      return [{ text: result ? render.deleted(result) : render.nothingToCorrect() }];
    }
    case "finish_workout":
      return finishWorkout(ctx);
    case "choose_day":
      return chooseDay(ctx, intent.day);
    case "ask_report":
      return [{ text: await reportText(ctx, intent, ids) }];
    case "setup_routine":
      return proposeRoutine(ctx, intent);
    case "clarify":
      if (!ctx.routine && (intent.reason === "greeting" || intent.reason === "help")) return [{ text: render.onboardingPrompt() }];
      return [{ text: render.clarify(intent.reason) }];
  }
}

async function reportText(ctx: Ctx, intent: Extract<Intent, { type: "ask_report" }>, ids: Record<string, string>) {
  switch (intent.scope) {
    case "next_workout":
      // Naming a day in the question ("metas do treino A push") also makes it today's workout.
      if (intent.day) return (await chooseDay(ctx, intent.day))[0].text;
      return reports.nextWorkoutText(ctx.user, ctx.routine, chosenLetter(ctx));
    case "last_workout":
      return reports.lastWorkoutText(ctx.user, ctx.routine);
    case "exercise":
      return ids.x ? reports.exerciseReportText(ctx.user, ids.x) : render.clarify("unknown_exercise");
    case "muscle_group":
      return reports.muscleGroupReportText(ctx.user, intent.muscle_group);
    case "week":
      return reports.weekReportText(ctx.user);
  }
}

/**
 * The user named a day of the routine: it replaces the suggested one until they train it (or the choice
 * expires). Only ever triggered by their message, never by the rotation. A workout already in progress keeps its day.
 */
async function chooseDay(ctx: Ctx, query: string): Promise<Out[]> {
  const days = ctx.routine?.days ?? [];
  const day = findDayByQuery(days, query);
  if (!day) return [{ text: days.length ? render.unknownDay(query, days) : render.onboardingPrompt() }];
  const open = await findOpenSession(ctx.user.id);
  if (open && open.dayId !== day.id) return [{ text: await reports.nextWorkoutText(ctx.user, ctx.routine) }];
  await saveState(ctx, { dayOverride: { letter: day.letter, at: Date.now() } });
  return [{ text: await reports.nextWorkoutText(ctx.user, ctx.routine, day.letter) }];
}

function summaryOut(closed: ClosedSession, reason: "user" | "complete" | "inactive"): Out {
  return {
    text: render.summary({ sessionId: closed.session.id, closeReason: reason, day: closed.day, data: closed.data, next: closed.next }),
    sessionId: closed.session.id,
  };
}

async function finishWorkout(ctx: Ctx): Promise<Out[]> {
  const open = await findOpenSession(ctx.user.id);
  if (ctx.state.dayOverride) await saveState(ctx, { dayOverride: null });
  const closed = open ? await closeSession(ctx.user, open.id, "user", ctx.routine) : null;
  if (!closed) return [{ text: render.noOpenSession() }];
  return [summaryOut(closed, "user"), await durationPrompt(ctx.user.id, closed)];
}

/** Text typed while a step is waiting for it. Returns null when the message is not meant for that step. */
async function handleAwaitedText(ctx: Ctx, pending: Pending, text: string): Promise<Out[] | null> {
  if (pending.kind === "days") {
    const days = parseWeekdaysInput(text);
    if (!days) return [{ text: render.askDays(true) }];
    await db.update(users).set({ trainingDays: days }).where(eq(users.id, ctx.user.id));
    return askTime(ctx);
  }
  if (pending.kind === "time") {
    if (isNoReminder(text)) return finishOnboarding(ctx, null);
    const time = parseTimeInput(text);
    if (!time) return [{ text: render.askTime(true) }];
    return finishOnboarding(ctx, time);
  }
  if (pending.kind === "duration_edit") {
    const minutes = parseDurationInput(text);
    // A long message is not a mistyped duration: let it through as a normal message (e.g. a set being logged).
    if (!minutes) return text.length > MAX_DURATION_REPLY_CHARS ? null : [{ text: render.askDurationEdit(true) }];
    await saveState(ctx, { pending: null });
    const updated = await setSessionDuration(ctx.user.id, pending.sessionId, minutes);
    return [{ text: updated ? render.durationUpdated(minutes) : render.expiredAction() }];
  }
  return null;
}

// ---------- Routine onboarding ----------

async function proposeRoutine(ctx: Ctx, intent: Extract<Intent, { type: "setup_routine" }>): Promise<Out[]> {
  const candidates = await pool(ctx);
  // Best guess per exercise; the user reviews the whole draft before saving (and can edit it on the site).
  const days: RoutineDraft = intent.days.map((d) => ({
    title: d.title,
    exercises: d.exercises.map((e) => {
      const result = matchExercise(e.name, candidates);
      const hit = result.match ?? result.candidates[0];
      return hit
        ? { id: hit.id, name: hit.name, sets: e.sets, muscleGroup: e.muscle_group }
        : { id: null, name: e.name, sets: e.sets, muscleGroup: e.muscle_group };
    }),
  }));
  const id = newPendingId();
  await saveState(ctx, { pending: { kind: "routine", id, days } });
  return [{ text: render.routineDraft(days), keyboard: confirmKeyboard(id, "Salvar treinos") }];
}

async function saveRoutineDraft(ctx: Ctx, days: RoutineDraft): Promise<Out[]> {
  const input = [];
  for (const d of days) {
    const exercises = [];
    for (const e of d.exercises) {
      const id = e.id ?? (await ensureCustomExercise(ctx.user.id, e.name, e.muscleGroup)).id;
      exercises.push({ exerciseId: id, plannedSets: e.sets });
    }
    input.push({ title: d.title, exercises });
  }
  await saveRoutine(ctx.user.id, input);
  // Onboarding continues: weekdays, then the training time.
  await saveState(ctx, { pending: { kind: "days", id: newPendingId() } });
  return [{ text: render.routineSaved(days[0].title) }, { text: render.askDays() }];
}

async function askTime(ctx: Ctx): Promise<Out[]> {
  await saveState(ctx, { pending: { kind: "time", id: newPendingId() } });
  return [{ text: render.askTime() }];
}

/** Last onboarding step: stores the time (null = no reminder) and closes the flow. */
async function finishOnboarding(ctx: Ctx, time: string | null): Promise<Out[]> {
  await saveState(ctx, { pending: null });
  const [saved] = await db.update(users).set({ reminderTime: time }).where(eq(users.id, ctx.user.id)).returning({ trainingDays: users.trainingDays });
  return [{ text: render.onboardingDone(saved?.trainingDays ?? [], time) }];
}

// ---------- Buttons ----------

async function handleCallback(ctx: Ctx, data: string | undefined): Promise<Out[]> {
  const cb = parseCallback(data);
  const pending: Pending | null = ctx.state.pending;
  if (!cb || !pending || pending.id !== cb.id) return [{ text: render.expiredAction() }];

  // Weekday and time steps are answered with text, never buttons.
  if (pending.kind === "days" || pending.kind === "time") return [{ text: render.expiredAction() }];

  await saveState(ctx, { pending: null });
  if (pending.kind === "duration" || pending.kind === "duration_edit") {
    if (cb.action === "ok" && pending.kind === "duration") return [{ text: render.durationConfirmed(pending.minutes) }];
    if (cb.action === "edit") {
      await saveState(ctx, { pending: { kind: "duration_edit", id: pending.id, sessionId: pending.sessionId } });
      return [{ text: render.askDurationEdit() }];
    }
    return [{ text: render.expiredAction() }];
  }
  if (cb.action === "no") return [{ text: render.cancelled() }];

  if (cb.action === "pick") {
    if (pending.kind !== "pick" || !pending.candidates[cb.index]) return [{ text: render.expiredAction() }];
    const overrides = { ...pending.overrides, [pending.slot]: pending.candidates[cb.index].id };
    // Picking the exercise is the confirmation the parser was missing.
    return execute(ctx, pending.intent, overrides, Math.max(pending.confidence, CONFIRM_BELOW), false);
  }

  if (pending.kind === "confirm") return execute(ctx, pending.intent, pending.overrides, 1, true);
  if (pending.kind === "routine") return saveRoutineDraft(ctx, pending.days);
  return [{ text: render.expiredAction() }];
}

// ---------- Delivery ----------

/** Sends replies in order; after a button tap the first one replaces the message that had the keyboard. */
async function deliver(chatId: number, outs: Out[], editMessageId?: number) {
  for (const [i, out] of outs.entries()) {
    // Editing fails for old or unchanged messages; the reply still has to arrive, so send it instead.
    const edited = i === 0 && editMessageId ? await editMessageText(chatId, editMessageId, out.text, out.keyboard).catch(() => null) : null;
    if (!edited) await sendMessage(chatId, out.text, out.keyboard);
    if (out.sessionId) await markSummarySent(out.sessionId);
  }
}
