import { and, eq, inArray, isNull, notExists, or, sql } from "drizzle-orm";
import { db, exercises, sessions, setEntries, type User } from "@/db/client";
import { loadDay } from "../routine";
import { applyCorrection, applyDelete } from "./corrections";
import { loadLog, recomputeTargets } from "./log";
import { dropSessionIfEmpty, ownSessionIds } from "./sessions";

// Edits made on the site, by set or session id: always scoped to the owner, with targets rebuilt afterwards.

const findSetById = async (userId: string, setId: string) => (await loadLog(userId, { setId }))[0] ?? null;

/** Corrects one set of the user's log, wherever it is in the history. Null when the set is not theirs. */
export async function editSetById(user: User, setId: string, change: { weight: number; reps: number }) {
  const old = await findSetById(user.id, setId);
  return old ? applyCorrection(user, old, change) : null;
}

/** Removes one set. A session left without sets is dropped, since the site has nothing to show for it. */
export async function deleteSetById(user: User, setId: string) {
  const old = await findSetById(user.id, setId);
  if (!old) return null;
  await applyDelete(user, old);
  return { sessionEmpty: await dropSessionIfEmpty(user.id, old.sessionId) };
}

/** Removes every set of one exercise from a session. A session left without sets is dropped. */
export async function deleteExerciseFromSession(user: User, sessionId: string, exerciseId: string) {
  const sets = await loadLog(user.id, { sessionId, exerciseIds: [exerciseId] });
  if (sets.length === 0) {
    // Repair path: a previous attempt may have voided the sets and then failed before rebuilding the targets,
    // so a retry lands here with nothing left to delete. Rebuilding is idempotent and cheap.
    await recomputeTargets(user.id, user.weightIncrementKg, await loadLog(user.id, { exerciseIds: [exerciseId] }), [exerciseId]);
    return null;
  }
  // One batch = one transaction (neon-http has no interactive ones). The row lock comes first, so concurrent
  // inserts (which take a key-share lock on the session via their FK) wait; the delete then runs as a new
  // statement that sees them and only removes the session if no valid set is left.
  const results = await db.batch([
    db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id))).for("update"),
    db
      .update(setEntries)
      .set({ voidedAt: new Date() })
      .where(
        and(
          eq(setEntries.sessionId, sessionId),
          eq(setEntries.exerciseId, exerciseId),
          isNull(setEntries.voidedAt),
          inArray(setEntries.sessionId, ownSessionIds(user.id)),
        ),
      ),
    db
      .delete(sessions)
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.userId, user.id),
          notExists(db.select({ one: sql`1` }).from(setEntries).where(and(eq(setEntries.sessionId, sessionId), isNull(setEntries.voidedAt)))),
        ),
      )
      .returning({ id: sessions.id }),
  ]);
  await recomputeTargets(user.id, user.weightIncrementKg, await loadLog(user.id, { exerciseIds: [exerciseId] }), [exerciseId]);
  return { sessionEmpty: results[2].length > 0 };
}

/**
 * Adds a set to a finished session from the site. It lands after the session's last set, keeping the
 * session's order, and counts as extra when the exercise is not in the day or its planned sets are done.
 */
export async function addSetToSession(user: User, sessionId: string, input: { exerciseId: string; weight: number; reps: number }) {
  const session = await db.query.sessions.findFirst({ where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)) });
  if (!session) return null;
  const exercise = await db.query.exercises.findFirst({ where: and(eq(exercises.id, input.exerciseId), or(isNull(exercises.ownerUserId), eq(exercises.ownerUserId, user.id))) });
  if (!exercise) return null;

  const day = session.dayId ? await loadDay(session.dayId) : null;
  const planned = day?.exercises.find((e) => e.exerciseId === input.exerciseId);
  const exerciseId = sql`${input.exerciseId}::uuid`;
  // Same rules as assignSet, but read inside the insert so they see every set committed before it.
  const isExtra = !day
    ? sql`false`
    : !planned
      ? sql`true`
      : sql`count(*) filter (where e.exercise_id = ${exerciseId} and not e.is_extra) >= ${planned.plannedSets}`;

  // One batch = one transaction. The session row lock serializes concurrent additions: the insert runs as a new
  // statement after it, so it sees the sets of any addition that committed first and takes the next position.
  const [, inserted] = await db.batch([
    db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id))).for("update"),
    db.execute(sql`
      insert into set_entries (session_id, exercise_id, set_position, is_extra, weight, reps, created_at)
      select s.id, ${exerciseId},
        coalesce(max(e.set_position) filter (where e.exercise_id = ${exerciseId}), 0) + 1,
        ${isExtra},
        ${input.weight}::numeric, ${input.reps}::smallint,
        greatest(s.started_at, max(e.created_at)) + interval '1 millisecond'
      from sessions s
      left join set_entries e on e.session_id = s.id and e.voided_at is null
      where s.id = ${sessionId}::uuid and s.user_id = ${user.id}::uuid
      group by s.id, s.started_at
      returning id
    `),
  ]);
  if (inserted.rows.length === 0) return null;

  const log = await loadLog(user.id, { exerciseIds: [input.exerciseId] });
  await recomputeTargets(user.id, user.weightIncrementKg, log, [input.exerciseId]);
  return true;
}

/** Deletes a whole session with its sets and rebuilds the targets of the exercises it touched. */
export async function deleteSessionById(user: User, sessionId: string) {
  const session = await db.query.sessions.findFirst({ where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)) });
  if (!session) return false;
  const touched = await db.selectDistinct({ exerciseId: setEntries.exerciseId }).from(setEntries).where(eq(setEntries.sessionId, sessionId));
  await db.delete(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)));
  const exerciseIds = touched.map((t) => t.exerciseId);
  if (exerciseIds.length) await recomputeTargets(user.id, user.weightIncrementKg, await loadLog(user.id, { exerciseIds }), exerciseIds);
  return true;
}
