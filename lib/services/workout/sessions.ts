import { and, desc, eq, isNull, notExists, sql } from "drizzle-orm";
import { db, routineDays, sessions, setEntries, type Session, type User } from "@/db/client";
import { targetChanges } from "@/lib/engine/progression";
import { sessionSummary } from "@/lib/engine/reports";
import { nextDay } from "@/lib/engine/session";
import { loadDay, type Routine } from "../routine";
import { loadLog } from "./log";

// Sessions: open/rotation lookups, closing (with the summary data) and the duration the user confirms.

export function findOpenSession(userId: string) {
  return db.query.sessions.findFirst({ where: and(eq(sessions.userId, userId), isNull(sessions.endedAt)) });
}

/** Letter of the day trained in the user's last finished session (drives the rotation). */
export async function lastTrainedLetter(userId: string) {
  const [row] = await db
    .select({ letter: routineDays.letter })
    .from(sessions)
    .innerJoin(routineDays, eq(routineDays.id, sessions.dayId))
    .where(and(eq(sessions.userId, userId), sql`${sessions.endedAt} is not null`))
    .orderBy(desc(sessions.startedAt))
    .limit(1);
  return row?.letter ?? null;
}

export async function nextRoutineDay(userId: string, routine: Routine | null) {
  return routine ? nextDay(routine.days, await lastTrainedLetter(userId)) : null;
}

export type CloseReason = NonNullable<Session["closeReason"]>;

/**
 * Deletes the session only if it has no valid set at that moment. One batch = one transaction (neon-http has no
 * interactive ones): the row lock comes first, so a concurrent insert (which takes a key-share lock on the session
 * via its FK) waits, and the delete then runs as a new statement that sees it. Returns whether it was deleted.
 */
export async function dropSessionIfEmpty(userId: string, sessionId: string) {
  const results = await db.batch([
    db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId))).for("update"),
    db
      .delete(sessions)
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.userId, userId),
          notExists(db.select({ one: sql`1` }).from(setEntries).where(and(eq(setEntries.sessionId, sessionId), isNull(setEntries.voidedAt)))),
        ),
      )
      .returning({ id: sessions.id }),
  ]);
  return results[1].length > 0;
}

/**
 * Closes a session once (the `ended_at is null` guard makes concurrent closes no-ops) and returns the data
 * for the summary, or null if it was already closed. Sessions left without valid sets are dropped.
 */
export async function closeSession(user: User, sessionId: string, reason: CloseReason, routine: Routine | null) {
  const session = await db.query.sessions.findFirst({ where: and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)) });
  if (!session || session.endedAt) return null;

  const endedAt = reason === "inactive" && session.lastSetAt ? session.lastSetAt : new Date();
  const [closed] = await db
    .update(sessions)
    .set({ endedAt, closeReason: reason })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id), isNull(sessions.endedAt)))
    .returning();
  if (!closed) return null;

  let sessionSets = await loadLog(user.id, { sessionId });
  if (sessionSets.length === 0) {
    if (await dropSessionIfEmpty(user.id, sessionId)) return null;
    // A set landed between the read and the delete: the session is not empty after all.
    sessionSets = await loadLog(user.id, { sessionId });
  }

  const exerciseIds = [...new Set(sessionSets.map((s) => s.exerciseId))];
  const log = await loadLog(user.id, { exerciseIds });
  const changes = targetChanges(log, sessionId, exerciseIds, user.weightIncrementKg);

  const day = closed.dayId ? await loadDay(closed.dayId) : null;
  return {
    session: closed,
    day: day ? { letter: day.letter, title: day.title } : null,
    // Same span the site shows (start to end of the session), which the user can then confirm or correct.
    data: { ...sessionSummary(sessionId, log, changes), durationMin: sessionMinutes(closed.startedAt, endedAt) },
    next: routine && day ? nextDay(routine.days, day.letter) : null,
  };
}

export type ClosedSession = NonNullable<Awaited<ReturnType<typeof closeSession>>>;

export const sessionMinutes = (startedAt: Date, endedAt: Date) => Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000));

/** The user's own duration for a finished session: the end moves so the site shows the same span. */
export async function setSessionDuration(userId: string, sessionId: string, minutes: number) {
  const session = await db.query.sessions.findFirst({ where: and(eq(sessions.id, sessionId), eq(sessions.userId, userId)) });
  if (!session?.endedAt) return false;
  await db
    .update(sessions)
    .set({ endedAt: new Date(session.startedAt.getTime() + minutes * 60_000) })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  return true;
}

export const markSummarySent = (userId: string, sessionId: string) =>
  db.update(sessions).set({ summarySentAt: new Date() }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));

/** Ids das sessões do usuário. `set_entries` não tem `user_id`: escritas nelas se prendem ao dono por aqui. */
export const ownSessionIds = (userId: string) => db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
