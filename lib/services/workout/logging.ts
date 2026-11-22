import { and, eq, isNull, sql } from "drizzle-orm";
import { appliedUpdates, db, sessions, setEntries, users, type User } from "@/db/client";
import { recordsFor } from "@/lib/engine/records";
import { isInactive, isSessionComplete, nextExerciseFor, pickDayForSession, planSetRows, remainingNames, upNextFor, type UpNext } from "@/lib/engine/session";
import { loadDay, type Routine } from "../routine";
import { loadLog, loadTargets, recomputeTargets, type LogRow } from "./log";
import { closeSession, dropSessionIfEmpty, findOpenSession, lastTrainedLetter, type ClosedSession } from "./sessions";

// Logging sets from the bot: idempotent per Telegram update, with targets, records and what comes next.

export type SetInput = { exerciseId: string; weight: number | null; reps: number; count: number };

/**
 * True when the Telegram update already wrote sets. A retried run (the first one failed after writing, before the
 * reply) must not log them again. The evidence is the `applied_updates` marker, written in the same transaction as the
 * sets and independent of them, so it survives the deletion of a set or of its emptied session. A marker that was
 * never finalized means the previous run died before rebuilding the targets: that work is resumed here.
 */
export async function updateAlreadyLogged(sourceUpdateId: number, userId: string) {
  const [row] = await db
    .select()
    .from(appliedUpdates)
    .where(and(eq(appliedUpdates.updateId, sourceUpdateId), eq(appliedUpdates.userId, userId)))
    .limit(1);
  if (!row) return false;
  if (!row.finalizedAt) {
    const [owner] = await db.select({ increment: users.weightIncrementKg }).from(users).where(eq(users.id, row.userId));
    if (owner && row.exerciseIds.length) await recomputeTargetsStable(row.userId, owner.increment, row.exerciseIds);
    await markUpdateFinalized(sourceUpdateId);
  }
  return true;
}

/**
 * Rebuilds targets and verifies the history did not change while doing so. neon-http has no interactive transactions,
 * so the read-then-write cannot be locked; instead the valid-set ids (a correction voids one id and adds another) are
 * compared after the write, and the rebuild reruns on a mismatch. A competing writer's own rebuild is always based on
 * its committed change, so a rerun that sees a stable log leaves targets reflecting the latest history. Throws if it
 * never settles, so the caller does not finalize and the update stays eligible for another repair.
 */
async function recomputeTargetsStable(userId: string, incrementKg: number, exerciseIds: string[]) {
  const fingerprint = (log: LogRow[]) => log.map((s) => s.id).sort().join(",");
  for (let attempt = 0; attempt < 5; attempt++) {
    const log = await loadLog(userId, { exerciseIds });
    await recomputeTargets(userId, incrementKg, log, exerciseIds);
    if (fingerprint(await loadLog(userId, { exerciseIds })) === fingerprint(log)) return;
  }
  throw new Error("Could not rebuild targets: history kept changing");
}

const markUpdateFinalized = (updateId: number) =>
  db.update(appliedUpdates).set({ finalizedAt: new Date() }).where(and(eq(appliedUpdates.updateId, updateId), isNull(appliedUpdates.finalizedAt)));

/**
 * Appends sets to the open session (opening one if needed), recomputes targets and detects records.
 * A stale open session (90 min idle) is closed first and returned in `closedBefore`.
 * `chosenLetter`: day the user asked to train; it wins over the rotation when a new session opens.
 * `sourceUpdateId`: Telegram update that asked for these sets. With the row index it is unique, so a concurrent duplicate inserts nothing.
 */
export async function logSets(
  user: User,
  routine: Routine | null,
  inputs: SetInput[],
  now = new Date(),
  chosenLetter?: string | null,
  sourceUpdateId?: number,
) {
  let closedBefore: ClosedSession | null = null;
  let session = await findOpenSession(user.id);
  if (session && isInactive(session.lastSetAt ?? session.startedAt, now)) {
    closedBefore = await closeSession(user, session.id, "inactive", routine);
    session = undefined;
  }

  let opened = false;
  if (!session) {
    const chosen = chosenLetter ? routine?.days.find((d) => d.letter === chosenLetter) : undefined;
    const day = chosen ?? (routine ? pickDayForSession(routine.days, await lastTrainedLetter(user.id), inputs[0].exerciseId) : null);
    [session] = await db
      .insert(sessions)
      .values({ userId: user.id, dayId: day?.id ?? null, startedAt: now, lastSetAt: now })
      .returning();
    opened = true;
  }

  const day = session.dayId ? await loadDay(session.dayId) : null;
  const exerciseIds = [...new Set(inputs.map((i) => i.exerciseId))];
  const [sessionSets, targets, priorLog] = await Promise.all([
    loadLog(user.id, { sessionId: session.id }),
    loadTargets(user.id, exerciseIds),
    loadLog(user.id, { exerciseIds }),
  ]);

  const sessionId = session.id;
  const rows: (typeof setEntries.$inferInsert & { id: string })[] = planSetRows(day, sessionSets, priorLog, targets, inputs).map((r, i) => ({
    id: crypto.randomUUID(),
    sessionId,
    ...r,
    createdAt: new Date(now.getTime() + i),
    ...(sourceUpdateId === undefined ? {} : { sourceUpdateId, sourceIdx: i }),
  }));

  // The sets are published only if this run wins the applied-update marker. With a source update, claim and sets are
  // ONE statement (the sets are selected from the claim CTE), so a lost claim inserts nothing, and a failure while
  // inserting the sets rolls the marker back with them, leaving the update claimable by a retry.
  let inserted: { id: string }[];
  if (sourceUpdateId === undefined) {
    [inserted] = await db.batch([
      db.insert(setEntries).values(rows).returning({ id: setEntries.id }),
      db.update(sessions).set({ lastSetAt: now }).where(and(eq(sessions.id, session.id), eq(sessions.userId, user.id))),
    ]);
  } else {
    const exerciseIdsSql = sql`array[${sql.join(exerciseIds.map((id) => sql`${id}::uuid`), sql`, `)}]::uuid[]`;
    const values = sql.join(
      rows.map(
        (r) =>
          sql`(${r.id}::uuid, ${r.sessionId}::uuid, ${r.exerciseId}::uuid, ${r.setPosition}::smallint, ${r.isExtra ?? false}::boolean, ${r.weight}::numeric, ${r.reps}::smallint, ${r.createdAt!.toISOString()}::timestamptz, ${sourceUpdateId}::bigint, ${r.sourceIdx}::smallint)`,
      ),
      sql`, `,
    );
    const [result] = await db.batch([
      db.execute(sql`
        with claim as (
          insert into applied_updates (update_id, user_id, session_id, exercise_ids)
          values (${sourceUpdateId}, ${user.id}, ${session.id}, ${exerciseIdsSql})
          on conflict (update_id) do nothing
          returning update_id
        )
        insert into set_entries (id, session_id, exercise_id, set_position, is_extra, weight, reps, created_at, source_update_id, source_idx)
        select v.* from claim, (values ${values}) as v(id, session_id, exercise_id, set_position, is_extra, weight, reps, created_at, source_update_id, source_idx)
        on conflict (source_update_id, source_idx) where source_update_id is not null do nothing
        returning id
      `),
      db.update(sessions).set({ lastSetAt: now }).where(and(eq(sessions.id, session.id), eq(sessions.userId, user.id))),
    ]);
    inserted = result.rows as { id: string }[];
  }

  // Only rows that were actually persisted count. When the marker was already owned (a replayed or concurrent
  // duplicate update) nothing was written: report it distinctly so the caller neither announces sets nor closes the
  // session. A session we opened for nothing is dropped.
  const persistedIds = new Set(inserted.map((r) => r.id));
  const written = rows.filter((r) => persistedIds.has(r.id));
  if (written.length === 0) {
    if (opened) await dropSessionIfEmpty(user.id, session.id);
    return { replay: true as const, closedBefore };
  }

  const [log, persistedSessionSets] = await Promise.all([loadLog(user.id, { exerciseIds }), loadLog(user.id, { sessionId: session.id })]);
  const newTargets = await recomputeTargets(user.id, user.weightIncrementKg, log, exerciseIds);
  if (sourceUpdateId !== undefined) await markUpdateFinalized(sourceUpdateId);
  const records = recordsFor(log, persistedIds);
  const names = new Map(log.map((s) => [s.exerciseId, s.exerciseName]));

  const allSessionSets = persistedSessionSets;
  const complete = isSessionComplete(day, allSessionSets);
  const remaining = remainingNames(day, allSessionSets);

  // Targets for what comes next. The exercise just logged has fresh targets; any other one is read from the table.
  const next = nextExerciseFor(day, allSessionSets, written.at(-1)!.exerciseId);
  let upNext: UpNext | null = null;
  if (next) {
    const byPosition = new Map<number, { weight: number; reps: number }>();
    if (newTargets.has(next.exerciseId)) {
      for (const [position, t] of newTargets.get(next.exerciseId)!) byPosition.set(position, t);
    } else {
      for (const t of (await loadTargets(user.id, [next.exerciseId])).get(next.exerciseId) ?? []) byPosition.set(t.position, t);
    }
    upNext = upNextFor(next, byPosition);
  }

  return {
    replay: false as const,
    closedBefore,
    sessionId: session.id,
    opened: opened && day ? { letter: day.letter, title: day.title } : null,
    upNext,
    items: written.map((r) => {
      const t = r.isExtra ? undefined : newTargets.get(r.exerciseId)?.get(r.setPosition);
      return {
        name: names.get(r.exerciseId) ?? "",
        setPosition: r.setPosition,
        weight: r.weight,
        reps: r.reps,
        isExtra: r.isExtra ?? false,
        record: records.get(r.id) ?? null,
        target: t ? { weight: t.weight, reps: t.reps } : null,
      };
    }),
    remaining,
    complete,
  };
}
