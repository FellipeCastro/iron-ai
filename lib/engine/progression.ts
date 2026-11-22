// Double progression per set position: hit the target → +1 rep; at 12 reps the load goes up and reps
// reset to 6. Pure functions, no I/O: the services feed them the valid log and persist the result.

import type { TargetChange } from "./reports";

export const REP_MIN = 6;
export const REP_MAX = 12;

export type Load = { weight: number; reps: number };

/** Rounds to the 0.25 kg precision the database stores. */
export const roundKg = (kg: number) => Math.round(kg * 4) / 4;

/** Next target after performing `done` and beating (or matching) the previous target. */
export function advance(done: Load, incrementKg: number): Load {
  if (done.reps >= REP_MAX) return { weight: roundKg(done.weight + incrementKg), reps: REP_MIN };
  return { weight: done.weight, reps: done.reps + 1 };
}

/** Whether a performed set counts as hitting the target. Heavier load counts even with fewer reps. */
export function hitTarget(target: Load, done: Load) {
  if (done.weight > target.weight) return true;
  return done.weight === target.weight && done.reps >= target.reps;
}

/**
 * New target for one set position.
 * - No target yet (first time): the set is the baseline, so the target is what was done; the +1 rep starts the next time it is hit.
 * - Heavier than the target: the user chose a new load, so progression rebases on what was done.
 * - Same load, reps ≥ target: advances from the reps actually done (doing 12 when 10 was asked jumps the load).
 * - Otherwise (missed reps or lighter load): the target stays.
 */
export function nextTarget(target: Load | null, done: Load, incrementKg: number): Load {
  if (!target) return { weight: done.weight, reps: done.reps };
  return hitTarget(target, done) ? advance(done, incrementKg) : target;
}

export type LoggedSet = Load & { setPosition: number; isExtra: boolean };

/**
 * Rebuilds the targets of one exercise from its full valid log (chronological order), so a correction
 * anywhere in the history cascades into every later target. Extra sets never move targets.
 */
export function computeTargets<T extends LoggedSet>(log: T[], incrementKg: number) {
  const targets = new Map<number, Load & { source: T }>();
  for (const set of log) {
    if (set.isExtra) continue;
    const next = nextTarget(targets.get(set.setPosition) ?? null, set, incrementKg);
    targets.set(set.setPosition, { ...next, source: set });
  }
  return targets;
}

/**
 * What one session changed in the targets: for each exercise (in the given order), the positions whose target
 * after the session differs from the target computed without it. `log` is the full valid log of those exercises.
 */
export function targetChanges<T extends LoggedSet & { exerciseId: string; sessionId: string }>(
  log: T[],
  sessionId: string,
  exerciseIds: string[],
  incrementKg: number,
): TargetChange[] {
  const changes: TargetChange[] = [];
  for (const exerciseId of exerciseIds) {
    const own = log.filter((s) => s.exerciseId === exerciseId);
    const before = computeTargets(
      own.filter((s) => s.sessionId !== sessionId),
      incrementKg,
    );
    const after = computeTargets(own, incrementKg);
    for (const [setPosition, t] of after) {
      const b = before.get(setPosition);
      if (!b || b.weight !== t.weight || b.reps !== t.reps) {
        changes.push({ exerciseId, setPosition, before: b ? { weight: b.weight, reps: b.reps } : null, after: { weight: t.weight, reps: t.reps } });
      }
    }
  }
  return changes;
}
