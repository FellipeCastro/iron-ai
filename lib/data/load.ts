import "server-only";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { cache } from "react";
import { db, routineDays, sessions, telegramLinks } from "@/db";
import { caloriesOf, recordsByExercise } from "@/lib/engine/reports";
import { localTime } from "@/lib/engine/reminders";
import { DAILY_MESSAGE_LIMIT, messagesToday } from "@/lib/limits";
import { loadRoutine } from "@/lib/services/routine";
import { ensureUser } from "@/lib/services/users";
import { loadLog, loadTargets, nextRoutineDay } from "@/lib/services/workout";
import type { CloseReason, DayLetter, RoutineDay, SessionExercise, Settings, WorkoutSession } from "./types";

/** The signed-in app user. Server Components and Server Actions only. */
export const currentAppUser = cache(async () => {
  const { userId } = await auth.protect();
  return ensureUser(userId);
});

/**
 * Everything the (app) pages derive their view models from, for the signed-in user. Memoized per request,
 * so several loaders in one render hit the database once.
 */
export const loadUserData = cache(async () => {
  const user = await currentAppUser();
  const now = new Date();
  const timeZone = user.timezone;

  const [routine, log, closed, link] = await Promise.all([
    loadRoutine(user.id),
    loadLog(user.id),
    db
      .select({ session: sessions, letter: routineDays.letter, title: routineDays.title })
      .from(sessions)
      .leftJoin(routineDays, eq(routineDays.id, sessions.dayId))
      .where(and(eq(sessions.userId, user.id), isNotNull(sessions.endedAt)))
      .orderBy(desc(sessions.startedAt)),
    db.query.telegramLinks.findFirst({ where: eq(telegramLinks.userId, user.id) }),
  ]);

  const routineIds = routine?.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)) ?? [];
  const [targets, next, usedToday] = await Promise.all([
    loadTargets(user.id, routineIds),
    nextRoutineDay(user.id, routine),
    link ? messagesToday(user.id, localTime(now, timeZone).date) : Promise.resolve(0),
  ]);

  // ---- Sessions (newest first) with per-set records ----
  const records = recordsByExercise(log);
  const bySession = new Map<string, typeof log>();
  for (const s of log) bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s]);

  const workoutSessions: WorkoutSession[] = closed.flatMap(({ session, letter, title }) => {
    const sets = bySession.get(session.id);
    if (!sets?.length) return [];
    const exercises = new Map<string, SessionExercise>();
    for (const s of sets) {
      const ex = exercises.get(s.exerciseId) ?? {
        id: s.exerciseId,
        name: s.exerciseName,
        muscleGroup: s.muscleGroup as SessionExercise["muscleGroup"],
        sets: [],
      };
      exercises.set(s.exerciseId, ex);
      ex.sets.push({
        position: s.setPosition,
        weight: s.weight,
        reps: s.reps,
        isExtra: s.isExtra,
        isPr: Boolean(records.get(s)),
        corrected: Boolean(s.supersedesId),
      });
    }
    const list = [...exercises.values()];
    return [
      {
        id: session.id,
        letter: (letter ?? "—") as DayLetter,
        title: title || (letter ? `Treino ${letter}` : "Treino livre"),
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt!.toISOString(),
        closeReason: (session.closeReason ?? "user") as CloseReason,
        exercises: list,
        calories: caloriesOf(sets),
        setCount: sets.length,
        prCount: list.filter((e) => e.sets.some((s) => s.isPr)).length,
      },
    ];
  });

  // ---- Routine with current targets ----
  const routineDaysView: RoutineDay[] = (routine?.days ?? []).map((d) => ({
    letter: d.letter as DayLetter,
    title: d.title,
    exercises: d.exercises.map((e) => ({
      id: e.exerciseId,
      name: e.name,
      muscleGroup: e.muscleGroup,
      plannedSets: e.plannedSets,
      targets: (targets.get(e.exerciseId) ?? []).filter((t) => t.position <= e.plannedSets),
    })),
  }));

  const settings: Settings = {
    telegram: {
      connected: Boolean(link),
      username: link ? (link.username ? `@${link.username}` : "Conta conectada") : null,
      linkedAt: link?.linkedAt.toISOString() ?? null,
    },
    timezone: timeZone,
    reminderTime: user.reminderTime?.slice(0, 5) ?? "",
    trainingDays: user.trainingDays,
    weightIncrementKg: user.weightIncrementKg,
    usage: { today: usedToday, limit: DAILY_MESSAGE_LIMIT },
  };

  return {
    user,
    now,
    timeZone,
    sessions: workoutSessions,
    routine: routineDaysView,
    nextLetter: (next?.letter ?? "A") as DayLetter,
    settings,
  };
});
