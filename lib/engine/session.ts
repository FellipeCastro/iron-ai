// Implicit sessions: the first logged set opens one; "terminei", completing every planned set or
// 90 minutes without a new set closes it. The rotation (A → B → C → A…) ignores the weekday.

export const INACTIVITY_MINUTES = 90;

export type PlanDay = { id: string; letter: string; position: number; exercises: { exerciseId: string; plannedSets: number }[] };

/** Day after the last trained one, by position, wrapping around. No history → first day. */
export function nextDay<D extends Pick<PlanDay, "letter" | "position">>(days: D[], lastLetter: string | null): D | null {
  const ordered = [...days].sort((a, b) => a.position - b.position);
  if (ordered.length === 0) return null;
  const i = lastLetter ? ordered.findIndex((d) => d.letter === lastLetter) : -1;
  return ordered[(i + 1) % ordered.length];
}

/**
 * Day a new session belongs to: the next one in the rotation, unless the first exercise logged is not
 * in it and belongs to exactly one other day (the user skipped ahead).
 */
export function pickDayForSession<D extends PlanDay>(days: D[], lastLetter: string | null, firstExerciseId: string): D | null {
  const expected = nextDay(days, lastLetter);
  if (!expected || expected.exercises.some((e) => e.exerciseId === firstExerciseId)) return expected;
  const matches = days.filter((d) => d.exercises.some((e) => e.exerciseId === firstExerciseId));
  return matches.length === 1 ? matches[0] : expected;
}

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Routine day the user named ("A", "treino push", "A push", "upper"): a standalone letter or a word of the
 * title. Returns null when nothing matches or two days tie, so the bot asks instead of guessing.
 */
export function findDayByQuery<D extends Pick<PlanDay, "letter"> & { title: string }>(days: D[], query: string): D | null {
  const words = plain(query).split(" ").filter((w) => w && w !== "treino" && w !== "dia");
  if (words.length === 0) return null;
  const scored = days
    .map((d) => {
      const title = new Set(plain(d.title).split(" "));
      let score = 0;
      for (const w of words) {
        if (w.length === 1 && w === d.letter.toLowerCase()) score += 1;
        else if (w.length > 1 && title.has(w)) score += 2;
      }
      return { d, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0 || (scored[1] && scored[1].score === scored[0].score)) return null;
  return scored[0].d;
}

export type SessionSet = { exerciseId: string; setPosition: number; isExtra: boolean };

/**
 * Position and "extra" flag for the next set of an exercise in the open session. A set is extra when the
 * exercise is not in the session's day or the planned sets are already done. Without a day (no routine)
 * nothing is extra, so progression still works.
 */
export function assignSet(day: PlanDay | null, sessionSets: SessionSet[], exerciseId: string) {
  const done = sessionSets.filter((s) => s.exerciseId === exerciseId);
  const setPosition = done.length + 1;
  if (!day) return { setPosition, isExtra: false };
  const planned = day.exercises.find((e) => e.exerciseId === exerciseId);
  return { setPosition, isExtra: !planned || setPosition > planned.plannedSets };
}

/** Planned sets still missing, per exercise, in plan order. */
export function remainingSets(day: PlanDay | null, sessionSets: SessionSet[]) {
  if (!day) return [];
  return day.exercises
    .map((e) => ({
      exerciseId: e.exerciseId,
      missing: e.plannedSets - sessionSets.filter((s) => s.exerciseId === e.exerciseId && !s.isExtra).length,
    }))
    .filter((e) => e.missing > 0);
}

export function isSessionComplete(day: PlanDay | null, sessionSets: SessionSet[]) {
  return !!day && day.exercises.length > 0 && remainingSets(day, sessionSets).length === 0;
}

export function isInactive(lastActivity: Date, now: Date) {
  return now.getTime() - lastActivity.getTime() >= INACTIVITY_MINUTES * 60_000;
}
