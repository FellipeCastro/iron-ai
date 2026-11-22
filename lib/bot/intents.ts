import type { Intent } from "@/lib/ai/schemas";
import { chosenLetter, pool, saveState, type Ctx } from "@/lib/bot/context";
import type { Out } from "@/lib/bot/deliver";
import { durationPrompt } from "@/lib/bot/duration";
import { proposeRoutine } from "@/lib/bot/onboarding";
import { matchExercise } from "@/lib/engine/match";
import { findDayByQuery, remainingSets } from "@/lib/engine/session";
import { loadDay } from "@/lib/services/routine";
import * as reports from "@/lib/services/reports";
import { closeSession, correctSet, deleteSet, findOpenSession, loadLog, logSets, updateAlreadyLogged, type ClosedSession } from "@/lib/services/workout";
import { confirmKeyboard, pickKeyboard } from "@/lib/telegram/keyboards";
import * as render from "@/lib/telegram/render";
import { newPendingId } from "@/lib/telegram/state";

// What the bot does with an Intent once the model has parsed the message: resolve exercise names (asking the user
// when ambiguous), ask for confirmation when the parse was unsure about a write, then apply it and build the replies.

/** Writes parsed with less confidence than this ask for confirmation first. */
export const CONFIRM_BELOW = 0.7;

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
export async function execute(ctx: Ctx, intent: Intent, overrides: Record<string, string>, confidence: number, confirmed: boolean): Promise<Out[]> {
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
      // A retry of an update that already wrote its sets (the first run failed before replying) must not log them again.
      if (await updateAlreadyLogged(ctx.updateId, ctx.user.id)) return [{ text: render.alreadyLogged() }];
      const result = await logSets(
        ctx.user,
        ctx.routine,
        intent.groups.map((g, i) => ({ exerciseId: ids[`g${i}`], weight: g.weight_kg, reps: g.reps, count: g.sets })),
        new Date(),
        chosenLetter(ctx),
        ctx.updateId,
      );
      const outs: Out[] = [];
      if (result.closedBefore) outs.push(summaryOut(result.closedBefore, "inactive"));
      // A concurrent duplicate of this update already wrote the sets: nothing new to announce or complete.
      if (result.replay) return [...outs, { text: render.alreadyLogged() }];
      // The chosen day now lives in the session itself.
      if (ctx.state.dayOverride) await saveState(ctx, { dayOverride: null });
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
      // Same replay guard as log_sets: a retried "apaga a última" must not void the set before the one already removed.
      if (await updateAlreadyLogged(ctx.updateId, ctx.user.id)) return [{ text: render.alreadyApplied() }];
      const result = await deleteSet(ctx.user, { exerciseId: ids.x ?? null, setNumber: intent.set_number }, ctx.updateId);
      if (result?.replay) return [{ text: render.alreadyApplied() }];
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

export async function finishWorkout(ctx: Ctx): Promise<Out[]> {
  const open = await findOpenSession(ctx.user.id);
  if (ctx.state.dayOverride) await saveState(ctx, { dayOverride: null });
  const closed = open ? await closeSession(ctx.user, open.id, "user", ctx.routine) : null;
  if (!closed) return [{ text: render.noOpenSession() }];
  return [summaryOut(closed, "user"), await durationPrompt(ctx.user.id, closed)];
}
