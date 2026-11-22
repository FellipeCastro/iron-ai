import { and, eq, inArray, isNull, notExists, or, sql } from "drizzle-orm";
import { db, exercises, sessions, setEntries, type User } from "@/db/client";
import { assignSet } from "@/lib/engine/session";
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

  const [day, sessionSets] = await Promise.all([session.dayId ? loadDay(session.dayId) : null, loadLog(user.id, { sessionId })]);
  const placed = assignSet(day, sessionSets, input.exerciseId);
  const last = sessionSets.reduce((max, s) => Math.max(max, s.createdAt.getTime()), session.startedAt.getTime());

  await db.insert(setEntries).values({
    sessionId,
    exerciseId: input.exerciseId,
    setPosition: placed.setPosition,
    isExtra: placed.isExtra,
    weight: input.weight,
    reps: input.reps,
    createdAt: new Date(last + 1),
  });

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
