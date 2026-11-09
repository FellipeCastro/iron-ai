import { redirect } from "next/navigation";
import { isStagnant } from "@/lib/engine/stagnation";
import { dateKey, estimate1rm, estimateCalories, formatDate } from "@/lib/format";
import { CHECKOUT_URL } from "@/lib/routes";
import { loadCatalog } from "@/lib/services/routine";
import { currentAppUser, loadUserData } from "./load";
import type { ExercisePoint, ExerciseRef, ExerciseSummary, PersonalRecord, Routine, Settings, WorkoutSession } from "./types";

export type * from "./types";

// Read model for the (app) pages: view models derived from the signed-in user's data (./load.ts).

/** View-model source for every page except Settings: without a subscription, the user is sent straight to Checkout. */
async function load() {
  const data = await loadUserData();
  if (!data.settings.billing.hasAccess) redirect(CHECKOUT_URL);
  return { ...data, today: dateKey(data.now, data.timeZone) };
}

const addDays = (key: string, days: number) => new Date(Date.parse(key) + days * 86_400_000).toISOString().slice(0, 10);
const isoWeekday = (key: string) => ((new Date(key).getUTCDay() + 6) % 7) + 1;
const weekStart = (key: string) => addDays(key, 1 - isoWeekday(key));
const sessionKey = (s: WorkoutSession, timeZone: string) => dateKey(new Date(s.startedAt), timeZone);

function exercisePoints(sessions: WorkoutSession[], id: string): ExercisePoint[] {
  return sessions
    .flatMap((s) => {
      const ex = s.exercises.find((e) => e.id === id);
      if (!ex) return [];
      const maxWeight = Math.max(...ex.sets.map((x) => x.weight));
      return [
        {
          date: s.startedAt,
          maxWeight,
          maxWeightReps: Math.max(...ex.sets.filter((x) => x.weight === maxWeight).map((x) => x.reps)),
          bestE1rm: Math.max(...ex.sets.map((x) => estimate1rm(x.weight, x.reps))),
          calories: estimateCalories(ex.sets.reduce((sum, x) => sum + x.weight * x.reps, 0)),
        },
      ];
    })
    .reverse();
}

function summarize(sessions: WorkoutSession[], ref: ExerciseRef, today: string, timeZone: string): ExerciseSummary {
  const points = exercisePoints(sessions, ref.id);
  const latest = points.at(-1)!;
  const cutoff = addDays(today, -30);
  const baseline = [...points].reverse().find((p) => dateKey(new Date(p.date), timeZone) <= cutoff) ?? points[0];
  const stagnant = isStagnant(
    sessions
      .filter((s) => s.exercises.some((e) => e.id === ref.id))
      .map((s) => ({ hasRecord: s.exercises.find((e) => e.id === ref.id)!.sets.some((x) => x.isPr) })),
  );

  return {
    ...ref,
    currentWeight: latest.maxWeight,
    weightChange30d: latest.maxWeight - baseline.maxWeight,
    trend: points.slice(-10).map((p) => p.maxWeight),
    trendReps: points.slice(-10).map((p) => p.maxWeightReps),
    stagnant,
    lastTrainedAt: latest.date,
  };
}

function trainedExercises(sessions: WorkoutSession[]): ExerciseRef[] {
  const seen = new Map<string, ExerciseRef>();
  for (const s of sessions) for (const e of s.exercises) if (!seen.has(e.id)) seen.set(e.id, { id: e.id, name: e.name, muscleGroup: e.muscleGroup });
  return [...seen.values()];
}

export async function getDashboard() {
  const { now, timeZone, today, sessions, routine, nextLetter, settings } = await load();
  const thisWeek = weekStart(today);
  const month = today.slice(0, 7);
  const prevMonth = addDays(`${month}-01`, -1).slice(0, 7);
  const keyed = sessions.map((s) => ({ s, key: sessionKey(s, timeZone) }));
  const inRange = (from: string, to: string) => keyed.filter(({ key }) => key >= from && key < to).map(({ s }) => s);
  const sumCalories = (list: WorkoutSession[]) => list.reduce((sum, s) => sum + s.calories, 0);

  const weeklyCalories = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(thisWeek, -7 * (7 - i));
    const list = inRange(start, addDays(start, 7));
    return {
      label: formatDate(`${start}T12:00:00Z`, "UTC"),
      value: sumCalories(list),
      detail: `${list.length} ${list.length === 1 ? "treino" : "treinos"}`,
      current: i === 7,
    };
  });

  const recentPrs: PersonalRecord[] = [];
  for (const s of sessions) {
    for (const e of s.exercises) {
      const pr = e.sets.filter((x) => x.isPr).sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
      if (pr && !recentPrs.some((p) => p.id === e.id)) {
        recentPrs.push({ id: e.id, name: e.name, muscleGroup: e.muscleGroup, weight: pr.weight, reps: pr.reps, date: s.startedAt });
      }
    }
  }

  const planned = new Set(routine.flatMap((d) => d.exercises.map((e) => e.id)));
  const summaries = trainedExercises(sessions)
    .filter((e) => planned.has(e.id))
    .map((ref) => summarize(sessions, ref, today, timeZone));

  return {
    now: now.toISOString(),
    timeZone,
    nextDay: routine.find((d) => d.letter === nextLetter) ?? null,
    isTrainingDay: settings.trainingDays.includes(isoWeekday(today)),
    reminderTime: settings.reminderTime,
    telegram: settings.telegram,
    week: { done: inRange(thisWeek, addDays(thisWeek, 7)).length, planned: settings.trainingDays.length },
    stats: {
      sessionsThisMonth: keyed.filter(({ key }) => key.startsWith(month)).length,
      sessionsPrevMonth: keyed.filter(({ key }) => key.startsWith(prevMonth)).length,
      calories7d: sumCalories(inRange(addDays(today, -6), addDays(today, 1))),
      caloriesPrev7d: sumCalories(inRange(addDays(today, -13), addDays(today, -6))),
      loadUps30d: summaries.filter((e) => e.weightChange30d > 0).length,
      trackedExercises: summaries.length,
    },
    weeklyCalories,
    recentPrs: recentPrs.slice(0, 4),
    stagnant: summaries.filter((e) => e.stagnant),
    lastSession: sessions[0] ?? null,
  };
}

export async function getRoutine(): Promise<Routine> {
  const { routine, nextLetter } = await load();
  return { days: routine, nextLetter };
}

export async function getHistory() {
  const { timeZone, today, sessions } = await load();
  const trained = new Map(sessions.map((s) => [sessionKey(s, timeZone), s.letter]));
  const first = addDays(weekStart(today), -7 * 11);
  const weeks = Array.from({ length: 12 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const key = addDays(first, w * 7 + d);
      return { key, letter: trained.get(key) ?? null, future: key > today };
    }),
  );
  const period = sessions.filter((s) => sessionKey(s, timeZone) >= first);
  const avgMinutes = period.length
    ? Math.round(period.reduce((sum, s) => sum + (Date.parse(s.endedAt) - Date.parse(s.startedAt)), 0) / period.length / 60_000)
    : 0;

  return {
    timeZone,
    sessions,
    weeks,
    stats: { total: period.length, perWeek: period.length / 12, avgMinutes },
  };
}

export async function getSession(id: string) {
  const { timeZone, sessions } = await load();
  const session = sessions.find((s) => s.id === id);
  return session ? { timeZone, session } : null;
}

export async function getExerciseSummaries() {
  const { timeZone, today, sessions } = await load();
  return { timeZone, exercises: trainedExercises(sessions).map((ref) => summarize(sessions, ref, today, timeZone)) };
}

export async function getExerciseDetail(id: string) {
  const { now, timeZone, today, sessions, routine } = await load();
  const ref = trainedExercises(sessions).find((e) => e.id === id);
  if (!ref) return null;

  const points = exercisePoints(sessions, id);
  const allSets = sessions.flatMap((s) => s.exercises.filter((e) => e.id === id).flatMap((e) => e.sets.map((x) => ({ ...x, date: s.startedAt }))));
  const record = allSets.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a));
  const planned = routine.flatMap((d) => d.exercises.map((e) => ({ ...e, letter: d.letter }))).find((e) => e.id === id);

  return {
    now: now.getTime(),
    timeZone,
    exercise: ref,
    summary: summarize(sessions, ref, today, timeZone),
    points,
    record,
    bestE1rm: Math.max(...points.map((p) => p.bestE1rm)),
    targets: planned?.targets ?? [],
    dayLetter: planned?.letter ?? null,
    recent: sessions
      .filter((s) => s.exercises.some((e) => e.id === id))
      .slice(0, 6)
      .map((s) => ({ id: s.id, date: s.startedAt, sets: s.exercises.find((e) => e.id === id)!.sets })),
  };
}

/** Not gated: this is where a user without access subscribes. */
export async function getSettings(): Promise<Settings> {
  return (await loadUserData()).settings;
}

export async function getCatalog(): Promise<ExerciseRef[]> {
  const user = await currentAppUser();
  return (await loadCatalog(user.id)).map((e) => ({ id: e.id, name: e.name, muscleGroup: e.muscleGroup }));
}
