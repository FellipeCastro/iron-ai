import { and, asc, eq, inArray, isNull, notInArray, sql, type SQL } from "drizzle-orm";
import { db, exercises, sessions, setEntries, setTargets } from "@/db/client";
import { computeTargets, type Load } from "@/lib/engine/progression";
import type { ReportSet } from "@/lib/engine/reports";

// Reading the valid set log and rebuilding targets from it. Used by every other module of the workout service.

export type LogRow = ReportSet & { id: string; supersedesId: string | null };

/** Every valid (non-voided) set of the user, chronological. Optionally limited to some exercises. */
export async function loadLog(userId: string, filter?: { exerciseIds?: string[]; sessionId?: string; setId?: string }): Promise<LogRow[]> {
  const where: SQL[] = [eq(sessions.userId, userId), isNull(setEntries.voidedAt)];
  if (filter?.setId) where.push(eq(setEntries.id, filter.setId));
  if (filter?.exerciseIds) where.push(inArray(setEntries.exerciseId, filter.exerciseIds));
  if (filter?.sessionId) where.push(eq(setEntries.sessionId, filter.sessionId));

  return db
    .select({
      id: setEntries.id,
      sessionId: setEntries.sessionId,
      exerciseId: setEntries.exerciseId,
      exerciseName: exercises.name,
      muscleGroup: exercises.muscleGroup,
      setPosition: setEntries.setPosition,
      weight: setEntries.weight,
      reps: setEntries.reps,
      isExtra: setEntries.isExtra,
      supersedesId: setEntries.supersedesId,
      createdAt: setEntries.createdAt,
    })
    .from(setEntries)
    .innerJoin(sessions, eq(sessions.id, setEntries.sessionId))
    .innerJoin(exercises, eq(exercises.id, setEntries.exerciseId))
    .where(and(...where))
    .orderBy(asc(sessions.startedAt), asc(setEntries.createdAt), asc(setEntries.setPosition));
}

export async function loadTargets(userId: string, exerciseIds?: string[]) {
  const rows = await db
    .select()
    .from(setTargets)
    .where(and(eq(setTargets.userId, userId), exerciseIds ? inArray(setTargets.exerciseId, exerciseIds) : undefined));
  const byExercise = new Map<string, { position: number; weight: number; reps: number }[]>();
  for (const r of rows) {
    byExercise.set(r.exerciseId, [...(byExercise.get(r.exerciseId) ?? []), { position: r.setPosition, weight: r.weight, reps: r.reps }]);
  }
  for (const list of byExercise.values()) list.sort((a, b) => a.position - b.position);
  return byExercise;
}

/**
 * Rebuilds `set_targets` for the given exercises from the full valid log. Called after every write, so a
 * correction anywhere in the history cascades into the current targets.
 */
export async function recomputeTargets(userId: string, incrementKg: number, log: LogRow[], exerciseIds: string[]) {
  const result = new Map<string, Map<number, Load>>();
  const writes = [];
  for (const exerciseId of exerciseIds) {
    const targets = computeTargets(
      log.filter((s) => s.exerciseId === exerciseId),
      incrementKg,
    );
    result.set(exerciseId, targets);
    // Upsert instead of delete + insert: two concurrent writes for the same user would otherwise collide on the
    // primary key AFTER their sets were committed, and the retry of the failed run would log the sets twice.
    const stale = and(eq(setTargets.userId, userId), eq(setTargets.exerciseId, exerciseId));
    writes.push(db.delete(setTargets).where(targets.size ? and(stale, notInArray(setTargets.setPosition, [...targets.keys()])) : stale));
    if (targets.size) {
      writes.push(
        db
          .insert(setTargets)
          .values(
            [...targets].map(([setPosition, t]) => ({ userId, exerciseId, setPosition, weight: t.weight, reps: t.reps, sourceEntryId: t.source.id })),
          )
          .onConflictDoUpdate({
            target: [setTargets.userId, setTargets.exerciseId, setTargets.setPosition],
            set: {
              weight: sql`excluded.weight`,
              reps: sql`excluded.reps`,
              sourceEntryId: sql`excluded.source_entry_id`,
              updatedAt: sql`now()`,
            },
          }),
      );
    }
  }
  if (writes.length) await db.batch(writes as [(typeof writes)[number], ...typeof writes]);
  return result;
}
