import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db, exercises, routineDays, sessions, setEntries, setTargets, type Session, type User } from "@/db";
import { computeTargets, type Load } from "@/lib/engine/progression";
import { markRecords, type PrKind } from "@/lib/engine/records";
import { sessionSummary, type ReportSet, type TargetChange } from "@/lib/engine/reports";
import { assignSet, isInactive, isSessionComplete, nextDay, pickDayForSession, remainingSets } from "@/lib/engine/session";
import { loadDay, type Routine } from "./routine";

// Workout log I/O. Rules live in lib/engine; this module loads the valid log, applies them and persists.
// The set log is append-only: a correction voids the old row and inserts a new one that supersedes it,
// keeping the original `created_at` (the moment the set was performed) so ordering stays stable.

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
async function recomputeTargets(userId: string, incrementKg: number, log: LogRow[], exerciseIds: string[]) {
  const result = new Map<string, Map<number, Load>>();
  const writes = [];
  for (const exerciseId of exerciseIds) {
    const targets = computeTargets(
      log.filter((s) => s.exerciseId === exerciseId),
      incrementKg,
    );
    result.set(exerciseId, targets);
    writes.push(db.delete(setTargets).where(and(eq(setTargets.userId, userId), eq(setTargets.exerciseId, exerciseId))));
    if (targets.size) {
      writes.push(
        db
          .insert(setTargets)
          .values(
            [...targets].map(([setPosition, t]) => ({ userId, exerciseId, setPosition, weight: t.weight, reps: t.reps, sourceEntryId: t.source.id })),
          ),
      );
    }
  }
  if (writes.length) await db.batch(writes as [(typeof writes)[number], ...typeof writes]);
  return result;
}

function recordsFor(log: LogRow[], ids: Set<string>) {
  const result = new Map<string, PrKind | null>();
  const byExercise = new Map<string, LogRow[]>();
  for (const s of log) byExercise.set(s.exerciseId, [...(byExercise.get(s.exerciseId) ?? []), s]);
  for (const list of byExercise.values()) {
    const kinds = markRecords(list, { includeFirst: false });
    list.forEach((s, i) => ids.has(s.id) && result.set(s.id, kinds[i]));
  }
  return result;
}

// ---------- Sessions ----------

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
 * Closes a session once (the `ended_at is null` guard makes concurrent closes no-ops) and returns the data
 * for the summary, or null if it was already closed. Sessions left without valid sets are dropped.
 */
export async function closeSession(user: User, sessionId: string, reason: CloseReason, routine: Routine | null) {
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session || session.endedAt) return null;

  const endedAt = reason === "inactive" && session.lastSetAt ? session.lastSetAt : new Date();
  const [closed] = await db
    .update(sessions)
    .set({ endedAt, closeReason: reason })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.endedAt)))
    .returning();
  if (!closed) return null;

  const sessionSets = await loadLog(user.id, { sessionId });
  if (sessionSets.length === 0) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  const exerciseIds = [...new Set(sessionSets.map((s) => s.exerciseId))];
  const log = await loadLog(user.id, { exerciseIds });
  const changes: TargetChange[] = [];
  for (const exerciseId of exerciseIds) {
    const own = log.filter((s) => s.exerciseId === exerciseId);
    const before = computeTargets(
      own.filter((s) => s.sessionId !== sessionId),
      user.weightIncrementKg,
    );
    const after = computeTargets(own, user.weightIncrementKg);
    for (const [setPosition, t] of after) {
      const b = before.get(setPosition);
      if (!b || b.weight !== t.weight || b.reps !== t.reps) {
        changes.push({ exerciseId, setPosition, before: b ? { weight: b.weight, reps: b.reps } : null, after: { weight: t.weight, reps: t.reps } });
      }
    }
  }

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

const sessionMinutes = (startedAt: Date, endedAt: Date) => Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000));

/** The user's own duration for a finished session: the end moves so the site shows the same span. */
export async function setSessionDuration(userId: string, sessionId: string, minutes: number) {
  const session = await db.query.sessions.findFirst({ where: and(eq(sessions.id, sessionId), eq(sessions.userId, userId)) });
  if (!session?.endedAt) return false;
  await db
    .update(sessions)
    .set({ endedAt: new Date(session.startedAt.getTime() + minutes * 60_000) })
    .where(eq(sessions.id, sessionId));
  return true;
}

export const markSummarySent = (sessionId: string) => db.update(sessions).set({ summarySentAt: new Date() }).where(eq(sessions.id, sessionId));

// ---------- Logging ----------

export type SetInput = { exerciseId: string; weight: number | null; reps: number; count: number };

/**
 * Appends sets to the open session (opening one if needed), recomputes targets and detects records.
 * A stale open session (90 min idle) is closed first and returned in `closedBefore`.
 */
export async function logSets(user: User, routine: Routine | null, inputs: SetInput[], now = new Date()) {
  let closedBefore: ClosedSession | null = null;
  let session = await findOpenSession(user.id);
  if (session && isInactive(session.lastSetAt ?? session.startedAt, now)) {
    closedBefore = await closeSession(user, session.id, "inactive", routine);
    session = undefined;
  }

  let opened = false;
  if (!session) {
    const day = routine ? pickDayForSession(routine.days, await lastTrainedLetter(user.id), inputs[0].exerciseId) : null;
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

  const rows: (typeof setEntries.$inferInsert & { id: string })[] = [];
  for (const input of inputs) {
    for (let n = 0; n < input.count; n++) {
      const placed = assignSet(day, [...sessionSets, ...rows.map((r) => ({ ...r, isExtra: r.isExtra ?? false }))], input.exerciseId);
      // No load said: the target for this position, else the last load used for the exercise, else bodyweight.
      const lastWeight = [...priorLog, ...rows].filter((s) => s.exerciseId === input.exerciseId).at(-1)?.weight;
      const target = targets.get(input.exerciseId)?.find((t) => t.position === placed.setPosition);
      rows.push({
        id: crypto.randomUUID(),
        sessionId: session.id,
        exerciseId: input.exerciseId,
        setPosition: placed.setPosition,
        isExtra: placed.isExtra,
        weight: input.weight ?? target?.weight ?? lastWeight ?? 0,
        reps: input.reps,
        createdAt: new Date(now.getTime() + rows.length),
      });
    }
  }

  await db.batch([db.insert(setEntries).values(rows), db.update(sessions).set({ lastSetAt: now }).where(eq(sessions.id, session.id))]);

  const log = await loadLog(user.id, { exerciseIds });
  const newTargets = await recomputeTargets(user.id, user.weightIncrementKg, log, exerciseIds);
  const records = recordsFor(log, new Set(rows.map((r) => r.id)));
  const names = new Map(log.map((s) => [s.exerciseId, s.exerciseName]));

  const allSessionSets = [
    ...sessionSets,
    ...rows.map((r) => ({ exerciseId: r.exerciseId, setPosition: r.setPosition, isExtra: r.isExtra ?? false })),
  ];
  const complete = isSessionComplete(day, allSessionSets);
  const remaining = remainingSets(day, allSessionSets).map((r) => ({
    name: day!.exercises.find((e) => e.exerciseId === r.exerciseId)!.name,
    missing: r.missing,
  }));

  return {
    closedBefore,
    sessionId: session.id,
    opened: opened && day ? { letter: day.letter, title: day.title } : null,
    items: rows.map((r) => {
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

// ---------- Corrections ----------

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

async function applyCorrection(user: User, old: LogRow, change: { weight: number | null; reps: number | null }) {
  const to = { weight: change.weight ?? old.weight, reps: change.reps ?? old.reps };

  await db.batch([
    db.update(setEntries).set({ voidedAt: new Date() }).where(eq(setEntries.id, old.id)),
    db.insert(setEntries).values({
      sessionId: old.sessionId,
      exerciseId: old.exerciseId,
      setPosition: old.setPosition,
      isExtra: old.isExtra,
      ...to,
      supersedesId: old.id,
      createdAt: old.createdAt,
    }),
  ]);

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

async function applyDelete(user: User, old: LogRow) {
  await db.update(setEntries).set({ voidedAt: new Date() }).where(eq(setEntries.id, old.id));
  const log = await loadLog(user.id, { exerciseIds: [old.exerciseId] });
  await recomputeTargets(user.id, user.weightIncrementKg, log, [old.exerciseId]);
  return { name: old.exerciseName, setPosition: old.setPosition, weight: old.weight, reps: old.reps };
}

// ---------- Edits from the site (by set id) ----------

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
  const remaining = await loadLog(user.id, { sessionId: old.sessionId });
  if (remaining.length === 0) await db.delete(sessions).where(eq(sessions.id, old.sessionId));
  return { sessionEmpty: remaining.length === 0 };
}
