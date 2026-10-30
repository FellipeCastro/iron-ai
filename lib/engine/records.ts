import type { Load } from "./progression";

export type PrKind = "weight" | "reps";

const beats = (a: Load, b: Load) => a.weight > b.weight || (a.weight === b.weight && a.reps > b.reps);

/**
 * The personal record of one exercise: a single set, the best over a chronological list of sets.
 * Only that set is marked; a set that held the record before is a regular set again.
 * - "weight": heavier than anything done before it;
 * - "reps": same load as the previous best, with more reps.
 * Ties go to the earliest set (repeating a record is not a new one).
 * The very first set is the baseline: it is only marked with `includeFirst`.
 */
export function markRecords<T extends Load>(sets: T[], { includeFirst = true }: { includeFirst?: boolean } = {}): (PrKind | null)[] {
  const result = sets.map((): PrKind | null => null);
  let best = -1;
  sets.forEach((s, i) => {
    if (best === -1 || beats(s, sets[best])) best = i;
  });
  if (best === -1 || (best === 0 && !includeFirst)) return result;

  const maxBefore = Math.max(-Infinity, ...sets.slice(0, best).map((s) => s.weight));
  result[best] = sets[best].weight > maxBefore ? "weight" : "reps";
  return result;
}

/** Heaviest set, ties broken by reps. */
export function bestSet<T extends Load>(sets: T[]): T | null {
  return sets.reduce<T | null>((a, b) => (!a || beats(b, a) ? b : a), null);
}
