import type { DayLetter, ExerciseRef, RoutineDay } from "@/lib/data/types";
import { DAY_LETTERS, MAX_PLANNED_SETS } from "@/lib/routine-rules";
import { searchByName } from "@/lib/search";

// Pure state transformations of the routine editor (components/app/routine-editor.tsx). No React here.

/** Planned sets kept between 1 and MAX_PLANNED_SETS. */
export const clampSets = (sets: number) => Math.min(MAX_PLANNED_SETS, Math.max(1, sets));

/** First letter not used by any day, or undefined when all of them are taken. */
export const nextFreeLetter = (days: RoutineDay[]): DayLetter | undefined => DAY_LETTERS.find((l) => !days.some((d) => d.letter === l));

/** Removes a day; letters stay sequential (A, B, C…) so the rotation order is always obvious. */
export const removeDayAndReletter = (days: RoutineDay[], letter: DayLetter): RoutineDay[] =>
  days.filter((d) => d.letter !== letter).map((d, i) => ({ ...d, letter: DAY_LETTERS[i] }));

/** Whether the edited days differ from the last saved ones. */
export const isDirty = (days: RoutineDay[], saved: RoutineDay[]) => JSON.stringify(days) !== JSON.stringify(saved);

/** Catalog search, leaving out the exercises with the given ids (the ones already in the day). */
export const searchExcluding = (catalog: ExerciseRef[], excludeIds: Set<string>, query: string) =>
  searchByName(
    catalog.filter((c) => !excludeIds.has(c.id)),
    query,
  );

/** Input of saveRoutineAction: a name is only sent when the user changed it (non-empty and different from the saved one). */
export function routineSavePayload(days: RoutineDay[], saved: RoutineDay[]) {
  const savedNames = new Map(saved.flatMap((d) => d.exercises.map((e) => [e.id, e.name] as const)));
  return days.map((d) => ({
    title: d.title,
    exercises: d.exercises.map((e) => ({
      id: e.id,
      plannedSets: e.plannedSets,
      ...(e.name.trim() && e.name.trim() !== savedNames.get(e.id) ? { name: e.name } : {}),
    })),
  }));
}

/** Renamed exercises may now be a different record (a personal copy of a catalog one): swap them in, without targets. */
export const applyRenamed = (days: RoutineDay[], renamed: Record<string, { id: string; name: string }>): RoutineDay[] =>
  days.map((d) => ({
    ...d,
    exercises: d.exercises.map((e) => (renamed[e.id] ? { ...e, ...renamed[e.id], targets: [] } : e)),
  }));
