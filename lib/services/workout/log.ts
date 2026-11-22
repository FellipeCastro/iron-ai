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

/** Identity of an exercise's valid history: its valid-set ids (a correction voids one id and adds another). */
const fingerprint = (log: LogRow[]) =>
  log
    .map((s) => s.id)
    .sort()
    .join(",");

/** The same fingerprint computed by the database, at the moment the statement runs. uuid order = lowercase hex order. */
const liveFingerprint = (userId: string, exerciseId: string) => sql`(
  select coalesce(string_agg(se.id::text, ',' order by se.id), '')
  from set_entries se join sessions s on s.id = se.session_id
  where s.user_id = ${userId} and se.exercise_id = ${exerciseId} and se.voided_at is null
)`;

/**
 * Rebuilds `set_targets` for the given exercises from the full valid log. Called after every write, so a
 * correction anywhere in the history cascades into the current targets.
 *
 * `log` is a snapshot the caller read earlier; a concurrent writer may have changed the history since. neon-http has
 * no interactive transactions, so the read-then-write cannot be locked. Instead every write is guarded by the
 * snapshot's fingerprint (a stale rebuild writes nothing), and the history is re-read afterwards: if it moved, the
 * rebuild reruns from the fresh log. The competing writer rebuilds after its own commit, so whichever rebuild lands
 * last was derived from the latest history. Throws if it never settles, so callers do not treat the work as finished.
 */
export async function recomputeTargets(userId: string, incrementKg: number, log: LogRow[], exerciseIds: string[]) {
  let snapshot = log;
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await writeTargets(userId, incrementKg, snapshot, exerciseIds);
    const fresh = await loadLog(userId, { exerciseIds });
    if (exerciseIds.every((id) => fingerprint(fresh.filter((s) => s.exerciseId === id)) === fingerprint(snapshot.filter((s) => s.exerciseId === id)))) {
      return result;
    }
    snapshot = fresh;
  }
  throw new Error("Could not rebuild targets: history kept changing");
}

async function writeTargets(userId: string, incrementKg: number, log: LogRow[], exerciseIds: string[]) {
  const result = new Map<string, Map<number, Load>>();
  const writes = [];
  for (const exerciseId of exerciseIds) {
    const history = log.filter((s) => s.exerciseId === exerciseId);
    const targets = computeTargets(history, incrementKg);
    result.set(exerciseId, targets);
    // Both statements only apply while the history is still the one the targets were derived from.
    const current = sql`${liveFingerprint(userId, exerciseId)} = ${fingerprint(history)}`;
    // Upsert instead of delete + insert: two concurrent writes for the same user would otherwise collide on the
    // primary key AFTER their sets were committed, and the retry of the failed run would log the sets twice.
    const stale = and(eq(setTargets.userId, userId), eq(setTargets.exerciseId, exerciseId), current);
    writes.push(db.delete(setTargets).where(targets.size ? and(stale, notInArray(setTargets.setPosition, [...targets.keys()])) : stale));
    if (targets.size) {
      const values = sql.join(
        [...targets].map(
          ([setPosition, t]) =>
            sql`(${userId}::uuid, ${exerciseId}::uuid, ${setPosition}::smallint, ${t.weight}::numeric, ${t.reps}::smallint, ${t.source.id}::uuid)`,
        ),
        sql`, `,
      );
      writes.push(
        db.execute(sql`
          insert into set_targets (user_id, exercise_id, set_position, weight, reps, source_entry_id)
          select v.* from (values ${values}) as v(user_id, exercise_id, set_position, weight, reps, source_entry_id)
          where ${current}
          on conflict (user_id, exercise_id, set_position) do update
          set weight = excluded.weight, reps = excluded.reps, source_entry_id = excluded.source_entry_id, updated_at = now()
        `),
      );
    }
  }
  if (writes.length) await db.batch(writes as [(typeof writes)[number], ...typeof writes]);
  return result;
}
