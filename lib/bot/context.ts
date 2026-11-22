import type { User } from "@/db/client";
import { rankPool, type MatchCandidate } from "@/lib/engine/match";
import * as reports from "@/lib/services/reports";
import { loadCatalog, loadDay, loadRoutine, type Routine, type RoutineDayFull } from "@/lib/services/routine";
import { saveChatState } from "@/lib/services/users";
import { findOpenSession, loadLog, nextRoutineDay } from "@/lib/services/workout";
import { readChatState, stampPending, type ChatState } from "@/lib/telegram/state";

// What the bot knows while handling one update: who, the chat state, the routine, and the exercise-matching pool
// (loaded once, on first use). The chat state lives in `telegram_links.chat_state`; `saveState` is the only writer here.

export type Ctx = { updateId: number; chatId: number; user: User; state: ChatState; routine: Routine | null; pool: MatchCandidate[] | null };

export async function loadCtx(updateId: number, chatId: number, user: User, rawState: unknown): Promise<Ctx> {
  return { updateId, chatId, user, state: readChatState(rawState), routine: await loadRoutine(user.id), pool: null };
}

/** Replaces the given parts of the chat state; what is not mentioned (e.g. the chosen day) is kept. */
export async function saveState(ctx: Ctx, state: Partial<ChatState>) {
  ctx.state = stampPending({ ...ctx.state, ...state });
  await saveChatState(ctx.user.id, ctx.state);
}

export const chosenLetter = (ctx: Ctx) => ctx.state.dayOverride?.letter ?? null;

/** Day being trained (open session), the one the user asked for, or the next one in the rotation. */
async function currentDay(ctx: Ctx): Promise<RoutineDayFull | null> {
  const open = await findOpenSession(ctx.user.id);
  if (open?.dayId) return loadDay(open.dayId);
  const chosen = ctx.routine?.days.find((d) => d.letter === chosenLetter(ctx));
  if (chosen) return chosen;
  return nextRoutineDay(ctx.user.id, ctx.routine);
}

export async function parserContext(ctx: Ctx) {
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
export async function pool(ctx: Ctx) {
  if (ctx.pool) return ctx.pool;
  const [day, catalog, open] = await Promise.all([currentDay(ctx), loadCatalog(ctx.user.id), findOpenSession(ctx.user.id)]);
  const sessionSets = open ? await loadLog(ctx.user.id, { sessionId: open.id }) : [];
  ctx.pool = rankPool(catalog, {
    routine: (ctx.routine?.days ?? []).flatMap((d) => d.exercises.map((e) => e.exerciseId)),
    today: (day?.exercises ?? []).map((e) => e.exerciseId),
    session: sessionSets.map((s) => s.exerciseId),
  });
  return ctx.pool;
}
