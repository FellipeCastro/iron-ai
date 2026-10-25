import { and, desc, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { db, exercises, routineDays, routineExercises, routines, type MuscleGroup } from "@/db";
import type { PlanDay } from "@/lib/engine/session";

// Routines are versioned: saving writes a new version, so past sessions keep pointing at the days
// they were trained with. The latest version is the current routine.

export type RoutineDayFull = Omit<PlanDay, "exercises"> & {
  title: string;
  exercises: (PlanDay["exercises"][number] & { name: string; muscleGroup: MuscleGroup; aliases: string[]; order: number })[];
};

export const DAY_LETTERS = ["A", "B", "C", "D", "E"] as const;
export const MAX_PLANNED_SETS = 6;

async function loadDays(where: SQL) {
  const rows = await db
    .select({
      dayId: routineDays.id,
      letter: routineDays.letter,
      title: routineDays.title,
      position: routineDays.position,
      exerciseId: routineExercises.exerciseId,
      order: routineExercises.order,
      plannedSets: routineExercises.plannedSets,
      name: exercises.name,
      muscleGroup: exercises.muscleGroup,
      aliases: exercises.aliases,
    })
    .from(routineDays)
    .leftJoin(routineExercises, eq(routineExercises.dayId, routineDays.id))
    .leftJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(where)
    .orderBy(routineDays.position, routineExercises.order);

  const days = new Map<string, RoutineDayFull>();
  for (const r of rows) {
    const day = days.get(r.dayId) ?? { id: r.dayId, letter: r.letter, title: r.title, position: r.position, exercises: [] };
    days.set(r.dayId, day);
    if (r.exerciseId && r.name && r.muscleGroup) {
      day.exercises.push({
        exerciseId: r.exerciseId,
        plannedSets: r.plannedSets!,
        order: r.order!,
        name: r.name,
        muscleGroup: r.muscleGroup,
        aliases: r.aliases ?? [],
      });
    }
  }
  return [...days.values()];
}

/** Current routine (latest version), or null when the user has none. */
export async function loadRoutine(userId: string) {
  const [routine] = await db.select().from(routines).where(eq(routines.userId, userId)).orderBy(desc(routines.version)).limit(1);
  if (!routine) return null;
  return { id: routine.id, version: routine.version, days: await loadDays(eq(routineDays.routineId, routine.id)) };
}

export type Routine = NonNullable<Awaited<ReturnType<typeof loadRoutine>>>;

/** A single day by id (may belong to an older routine version, e.g. the one an open session started on). */
export async function loadDay(dayId: string) {
  const [day] = await loadDays(eq(routineDays.id, dayId));
  return day ?? null;
}

export type RoutineInput = { title: string; exercises: { exerciseId: string; plannedSets: number }[] }[];

/** Saves a new routine version. Exercise ids must be global catalog entries or the user's own. */
export async function saveRoutine(userId: string, days: RoutineInput) {
  if (days.length === 0 || days.length > DAY_LETTERS.length) throw new Error("A rotina precisa ter de 1 a 5 treinos.");

  const ids = [...new Set(days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))];
  if (ids.length) {
    const allowed = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(inArray(exercises.id, ids), or(isNull(exercises.ownerUserId), eq(exercises.ownerUserId, userId))));
    if (allowed.length !== ids.length) throw new Error("Exercício inválido na rotina.");
  }

  const [last] = await db
    .select({ version: routines.version })
    .from(routines)
    .where(eq(routines.userId, userId))
    .orderBy(desc(routines.version))
    .limit(1);
  const routineId = crypto.randomUUID();
  const dayRows = days.map((d, i) => ({
    id: crypto.randomUUID(),
    routineId,
    letter: DAY_LETTERS[i],
    title: d.title.trim().slice(0, 60),
    position: i + 1,
  }));
  const exerciseRows = days.flatMap((d, i) =>
    // A day lists each exercise once; duplicates keep the first occurrence.
    [...new Map(d.exercises.map((e) => [e.exerciseId, e])).values()].map((e, order) => ({
      dayId: dayRows[i].id,
      exerciseId: e.exerciseId,
      order: order + 1,
      plannedSets: Math.min(MAX_PLANNED_SETS, Math.max(1, Math.round(e.plannedSets))),
    })),
  );

  // neon-http batches run as one transaction; the unique (user_id, version) guards concurrent saves.
  await db.batch([
    db.insert(routines).values({ id: routineId, userId, version: (last?.version ?? 0) + 1 }),
    db.insert(routineDays).values(dayRows),
    ...(exerciseRows.length ? [db.insert(routineExercises).values(exerciseRows)] : []),
  ]);
  return routineId;
}

/** Global catalog plus the user's custom exercises. */
export function loadCatalog(userId: string) {
  return db
    .select({ id: exercises.id, name: exercises.name, muscleGroup: exercises.muscleGroup, aliases: exercises.aliases })
    .from(exercises)
    .where(or(isNull(exercises.ownerUserId), eq(exercises.ownerUserId, userId)))
    .orderBy(exercises.name);
}

/** Custom exercise owned by the user; reuses an existing one with the same name. */
export async function ensureCustomExercise(userId: string, name: string, muscleGroup: MuscleGroup) {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 80);
  const label = clean.charAt(0).toUpperCase() + clean.slice(1);
  const [row] = await db
    .insert(exercises)
    .values({ name: label, muscleGroup, aliases: [clean.toLowerCase()], ownerUserId: userId })
    .onConflictDoUpdate({ target: [exercises.ownerUserId, exercises.name], set: { name: label } })
    .returning({ id: exercises.id, name: exercises.name });
  return row;
}
