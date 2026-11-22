import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, sessions, setEntries, type User } from "@/db/client";
import { loadLog, recomputeTargets, type LogRow } from "./log";
import { findOpenSession, ownSessionIds } from "./sessions";

// Corrections and removals asked through the bot ("na verdade foram 12", "apaga a última"). The site reuses
// applyCorrection/applyDelete by set id.

export type SetSelector = { exerciseId: string | null; setNumber: number | null };

/**
 * The set a correction/removal refers to: within the open session (or the latest one), the given set of
 * the given exercise, defaulting to its last set, or simply the last set logged.
 */
async function findSet(userId: string, selector: SetSelector) {
  const open = await findOpenSession(userId);
  const [latest] = open ? [open] : await db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.startedAt)).limit(1);
  if (!latest) return null;

  let sets = await loadLog(userId, { sessionId: latest.id });
  if (selector.exerciseId) sets = sets.filter((s) => s.exerciseId === selector.exerciseId);
  if (selector.setNumber !== null) return sets.find((s) => s.setPosition === selector.setNumber) ?? null;
  return sets.at(-1) ?? null;
}

export async function correctSet(user: User, selector: SetSelector, change: { weight: number | null; reps: number | null }) {
  const old = await findSet(user.id, selector);
  return old ? applyCorrection(user, old, change) : null;
}

export async function applyCorrection(user: User, old: LogRow, change: { weight: number | null; reps: number | null }) {
  const to = { weight: change.weight ?? old.weight, reps: change.reps ?? old.reps };

  // One statement: the replacement is inserted from the row this very statement voided. If another correction or a
  // delete got there first, the row is no longer valid, nothing is voided and nothing is inserted (the unique
  // supersedes_id index is the backstop). `old` was read earlier and may be stale, so it only supplies the id.
  const written = await db.execute(sql`
    with voided as (
      update set_entries set voided_at = now()
      where id = ${old.id} and voided_at is null and session_id in (select id from sessions where user_id = ${user.id})
      returning id, session_id, exercise_id, set_position, is_extra, created_at
    )
    insert into set_entries (session_id, exercise_id, set_position, is_extra, weight, reps, supersedes_id, created_at)
    select session_id, exercise_id, set_position, is_extra, ${to.weight}::numeric, ${to.reps}::smallint, id, created_at from voided
    returning id
  `);
  if (written.rows.length === 0) return null;

  const log = await loadLog(user.id, { exerciseIds: [old.exerciseId] });
  const targets = await recomputeTargets(user.id, user.weightIncrementKg, log, [old.exerciseId]);
  const t = old.isExtra ? undefined : targets.get(old.exerciseId)?.get(old.setPosition);
  return {
    item: { name: old.exerciseName, setPosition: old.setPosition, from: { weight: old.weight, reps: old.reps }, to },
    target: t ? { weight: t.weight, reps: t.reps } : null,
  };
}

export async function deleteSet(user: User, selector: SetSelector) {
  const old = await findSet(user.id, selector);
  return old ? applyDelete(user, old) : null;
}

export async function applyDelete(user: User, old: LogRow) {
  await db.update(setEntries).set({ voidedAt: new Date() }).where(and(eq(setEntries.id, old.id), inArray(setEntries.sessionId, ownSessionIds(user.id))));
  const log = await loadLog(user.id, { exerciseIds: [old.exerciseId] });
  await recomputeTargets(user.id, user.weightIncrementKg, log, [old.exerciseId]);
  return { name: old.exerciseName, setPosition: old.setPosition, weight: old.weight, reps: old.reps };
}
