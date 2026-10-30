import type { Load } from "./progression";

export type PrKind = "weight" | "reps";

const beats = (a: Load, b: Load) => a.weight > b.weight || (a.weight === b.weight && a.reps > b.reps);

/**
 * Records over a chronological list of sets of one exercise, one per session at most:
 * the session's best set, if it beats the best of every earlier session. A later session
 * breaking it does not take it away — the record stays in the session where it was set.
 * - "weight": heavier than anything done in earlier sessions;
 * - "reps": same load as the previous best, with more reps.
 * Ties go to the earliest set (repeating a record is not a new one).
 * The very first session is the baseline: its best set is only marked with `includeFirst`.
 */
export function markRecords<T extends Load & { sessionId: string }>(
  sets: T[],
  { includeFirst = true }: { includeFirst?: boolean } = {},
): (PrKind | null)[] {
  const result = sets.map((): PrKind | null => null);
  let best: Load | null = null;
  let maxWeight = -Infinity;

  for (let start = 0; start < sets.length; ) {
    let end = start;
    while (end < sets.length && sets[end].sessionId === sets[start].sessionId) end++;

    let top = start;
    for (let i = start + 1; i < end; i++) if (beats(sets[i], sets[top])) top = i;

    if (best ? beats(sets[top], best) : includeFirst) result[top] = sets[top].weight > maxWeight ? "weight" : "reps";
    if (!best || beats(sets[top], best)) best = sets[top];
    for (let i = start; i < end; i++) maxWeight = Math.max(maxWeight, sets[i].weight);
    start = end;
  }
  return result;
}

/** Heaviest set, ties broken by reps. */
export function bestSet<T extends Load>(sets: T[]): T | null {
  return sets.reduce<T | null>((a, b) => (!a || beats(b, a) ? b : a), null);
}
