import type { Load } from "./progression";

export type PrKind = "weight" | "reps";

/**
 * Personal records over a chronological list of sets of one exercise:
 * - "weight": heavier than anything done before;
 * - "reps": more reps than ever at a load already used before (best set at that load).
 * The very first set of an exercise is the baseline, never a record.
 */
export function markRecords<T extends Load>(sets: T[]): (PrKind | null)[] {
  let maxWeight = -Infinity;
  const bestReps = new Map<number, number>();

  return sets.map((s) => {
    let kind: PrKind | null = null;
    if (maxWeight !== -Infinity) {
      if (s.weight > maxWeight) kind = "weight";
      else if (bestReps.has(s.weight) && s.reps > bestReps.get(s.weight)!) kind = "reps";
    }
    maxWeight = Math.max(maxWeight, s.weight);
    bestReps.set(s.weight, Math.max(bestReps.get(s.weight) ?? 0, s.reps));
    return kind;
  });
}

/** Heaviest set, ties broken by reps. */
export function bestSet<T extends Load>(sets: T[]): T | null {
  return sets.reduce<T | null>((a, b) => (!a || b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a), null);
}
