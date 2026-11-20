import type { Intent } from "@/lib/ai/schemas";
import { pool, saveState, type Ctx } from "@/lib/bot/context";
import type { Out } from "@/lib/bot/deliver";
import { parseDurationInput } from "@/lib/engine/duration";
import { matchExercise } from "@/lib/engine/match";
import { isNoReminder, parseTimeInput, parseWeekdaysInput } from "@/lib/engine/reminders";
import { ensureCustomExercise, saveRoutine } from "@/lib/services/routine";
import { setReminderTime, setTrainingDays } from "@/lib/services/users";
import { setSessionDuration } from "@/lib/services/workout";
import { confirmKeyboard } from "@/lib/telegram/keyboards";
import * as render from "@/lib/telegram/render";
import { newPendingId, type Pending, type RoutineDraft } from "@/lib/telegram/state";

// Steps of the conversation that wait for typed text or a draft: the routine draft, the onboarding questions
// (weekdays, then training time) and the corrected workout duration. Each one stores its pending step in the chat state.

const MAX_DURATION_REPLY_CHARS = 10;

/** Text typed while a step is waiting for it. Returns null when the message is not meant for that step. */
export async function handleAwaitedText(ctx: Ctx, pending: Pending, text: string): Promise<Out[] | null> {
  if (pending.kind === "days") {
    const days = parseWeekdaysInput(text);
    if (!days) return [{ text: render.askDays(true) }];
    await setTrainingDays(ctx.user.id, days);
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

export async function proposeRoutine(ctx: Ctx, intent: Extract<Intent, { type: "setup_routine" }>): Promise<Out[]> {
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

export async function saveRoutineDraft(ctx: Ctx, days: RoutineDraft): Promise<Out[]> {
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
  const saved = await setReminderTime(ctx.user.id, time);
  return [{ text: render.onboardingDone(saved?.trainingDays ?? [], time) }];
}
