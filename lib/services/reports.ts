import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { db, sessions, type MuscleGroup, type User } from "@/db";
import { periodsFor, type ReportKind } from "@/lib/engine/periods";
import { caloriesOf, exerciseReport, muscleGroupReport, periodReport, recordsByExercise, sessionSummary } from "@/lib/engine/reports";
import * as render from "@/lib/telegram/render";
import { loadDay, type RoutineDayFull, type Routine } from "./routine";
import { findOpenSession, loadLog, loadTargets, nextRoutineDay, sessionMinutes } from "./workout";

// Telegram reports: data from the engine, text from the templates. Same numbers the site shows.

export async function planView(userId: string, day: RoutineDayFull | null): Promise<render.PlanView | null> {
  if (!day) return null;
  const targets = await loadTargets(
    userId,
    day.exercises.map((e) => e.exerciseId),
  );
  return {
    letter: day.letter,
    title: day.title,
    exercises: day.exercises.map((e) => ({ name: e.name, plannedSets: e.plannedSets, targets: targets.get(e.exerciseId) ?? [] })),
  };
}

export async function nextWorkoutText(user: User, routine: Routine | null, chosenLetter?: string | null) {
  const open = await findOpenSession(user.id);
  if (open?.dayId) return render.nextWorkout(await planView(user.id, await loadDay(open.dayId)), "Treino em andamento");
  const chosen = chosenLetter ? routine?.days.find((d) => d.letter === chosenLetter) : undefined;
  if (chosen) return render.nextWorkout(await planView(user.id, chosen), "Treino de hoje");
  return render.nextWorkout(await planView(user.id, await nextRoutineDay(user.id, routine)));
}

export async function lastWorkoutText(user: User, routine: Routine | null) {
  const [last] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, user.id), isNotNull(sessions.endedAt)))
    .orderBy(desc(sessions.startedAt))
    .limit(1);
  if (!last) return render.noHistory();
  const log = await loadLog(user.id);
  const upTo = log.filter((s) => s.createdAt.getTime() <= (last.endedAt ?? new Date()).getTime() || s.sessionId === last.id);
  const day = last.dayId ? await loadDay(last.dayId) : null;
  return render.summary({
    sessionId: last.id,
    closeReason: last.closeReason ?? "user",
    label: "Relatório do treino",
    day: day ? { letter: day.letter, title: day.title } : null,
    // The session's own start/end, so a duration the user corrected wins over the first-to-last-set estimate.
    data: { ...sessionSummary(last.id, upTo, []), durationMin: last.endedAt ? sessionMinutes(last.startedAt, last.endedAt) : 0 },
    next: await nextRoutineDay(user.id, routine),
  });
}

export async function exerciseReportText(user: User, exerciseId: string) {
  const log = await loadLog(user.id, { exerciseIds: [exerciseId] });
  const report = exerciseReport(log, exerciseId, new Date());
  return report ? render.exerciseReportText(exerciseId, report) : render.noHistory();
}

export async function muscleGroupReportText(user: User, group: MuscleGroup | null) {
  const days = 7;
  const log = await loadLog(user.id);
  return render.muscleGroupReportText(muscleGroupReport(log, new Date(), days), days, group);
}

export async function weekReportText(user: User) {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [log, recent] = await Promise.all([
    loadLog(user.id),
    db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), gte(sessions.startedAt, since))),
  ]);
  const records = recordsByExercise(log, { includeFirst: false });
  const week = log.filter((s) => s.createdAt >= since);
  return render.weekReport({
    sessions: recent.length,
    planned: user.trainingDays.length,
    sets: week.length,
    calories: caloriesOf(week),
    records: week.filter((s) => records.get(s)).length,
  });
}

/**
 * Automatic weekly/monthly report for the period that closed before `localDate` (the user's Monday). Null when the
 * user did not train in it: an empty report is noise.
 */
export async function periodReportText(user: User, kind: ReportKind, localDate: string) {
  const { current, previous } = periodsFor(kind, localDate, user.timezone);
  const report = periodReport(await loadLog(user.id), current, previous);
  return report.sets === 0 ? null : render.periodReportText(kind, current, report);
}
