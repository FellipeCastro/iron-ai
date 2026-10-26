import { estimate1rm, estimateCalories } from "@/lib/format";
import type { Load } from "./progression";
import { bestSet, markRecords, type PrKind } from "./records";
import { isStagnant } from "./stagnation";

// Report data built from the log. Rendering to text (Telegram) or UI (site) happens elsewhere.

export type ReportSet = Load & {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string;
  sessionId: string;
  setPosition: number;
  isExtra: boolean;
  createdAt: Date;
};

export const caloriesOf = (sets: Load[]) => estimateCalories(sets.reduce((sum, s) => sum + s.weight * s.reps, 0));

function groupBy<T, K>(items: T[], key: (t: T) => K) {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}

/** Records per set for a whole history (chronological), keyed by the set object. */
export function recordsByExercise<T extends ReportSet>(history: T[]) {
  const result = new Map<T, PrKind | null>();
  for (const sets of groupBy(history, (s) => s.exerciseId).values()) {
    const kinds = markRecords(sets);
    sets.forEach((s, i) => result.set(s, kinds[i]));
  }
  return result;
}

export type TargetChange = { exerciseId: string; setPosition: number; before: Load | null; after: Load };

/** Post-workout summary. `history` holds every valid set up to and including this session. */
export function sessionSummary<T extends ReportSet>(sessionId: string, history: T[], targetChanges: TargetChange[]) {
  const records = recordsByExercise(history);
  const sets = history.filter((s) => s.sessionId === sessionId);
  const exercises = [...groupBy(sets, (s) => s.exerciseId).values()].map((list) => ({
    exerciseId: list[0].exerciseId,
    name: list[0].exerciseName,
    sets: list.map((s) => ({ weight: s.weight, reps: s.reps, isExtra: s.isExtra, record: records.get(s) ?? null })),
    nextTargets: targetChanges.filter((t) => t.exerciseId === list[0].exerciseId).sort((a, b) => a.setPosition - b.setPosition),
  }));
  const first = sets[0]?.createdAt;
  const last = sets.at(-1)?.createdAt;

  return {
    setCount: sets.length,
    calories: caloriesOf(sets),
    durationMin: first && last ? Math.round((last.getTime() - first.getTime()) / 60_000) : 0,
    exercises,
    records: exercises.flatMap((e) => e.sets.filter((s) => s.record).map((s) => ({ name: e.name, ...s }))),
    loadUps: targetChanges.filter((t) => t.before && t.after.weight > t.before.weight).length,
  };
}

/** One exercise over time: best set per session, record, trend, stagnation. `history` is chronological. */
export function exerciseReport<T extends ReportSet>(history: T[], exerciseId: string, now: Date) {
  const sets = history.filter((s) => s.exerciseId === exerciseId);
  if (sets.length === 0) return null;
  const records = recordsByExercise(sets);
  const sessions = [...groupBy(sets, (s) => s.sessionId).values()].map((list) => ({
    date: list[0].createdAt,
    best: bestSet(list)!,
    calories: caloriesOf(list),
    hasRecord: list.some((s) => records.get(s)),
  }));
  const newestFirst = [...sessions].reverse();
  const cutoff = now.getTime() - 30 * 86_400_000;
  const baseline = newestFirst.find((s) => s.date.getTime() <= cutoff) ?? sessions[0];
  const latest = sessions.at(-1)!;
  const record = bestSet(sets)!;

  return {
    name: sets[0].exerciseName,
    muscleGroup: sets[0].muscleGroup,
    sessionCount: sessions.length,
    record: { weight: record.weight, reps: record.reps, date: record.createdAt },
    bestE1rm: Math.max(...sets.map((s) => estimate1rm(s.weight, s.reps))),
    latest: { weight: latest.best.weight, reps: latest.best.reps, date: latest.date },
    weightChange30d: latest.best.weight - baseline.best.weight,
    recent: newestFirst.slice(0, 5).map((s) => ({ date: s.date, weight: s.best.weight, reps: s.best.reps, calories: s.calories })),
    stagnant: isStagnant(newestFirst),
  };
}

/** Sets and estimated calories per muscle group in the last `days` days vs the period before. */
export function muscleGroupReport<T extends ReportSet>(history: T[], now: Date, days = 7) {
  const span = days * 86_400_000;
  const current = history.filter((s) => now.getTime() - s.createdAt.getTime() < span);
  const previous = history.filter((s) => {
    const age = now.getTime() - s.createdAt.getTime();
    return age >= span && age < 2 * span;
  });
  const prevByGroup = groupBy(previous, (s) => s.muscleGroup);

  return [...groupBy(current, (s) => s.muscleGroup).entries()]
    .map(([group, list]) => ({
      group,
      sets: list.length,
      calories: caloriesOf(list),
      previousCalories: caloriesOf(prevByGroup.get(group) ?? []),
      exercises: [...new Set(list.map((s) => s.exerciseName))],
    }))
    .sort((a, b) => b.calories - a.calories);
}
