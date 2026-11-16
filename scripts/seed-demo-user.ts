import "../db/env";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, exercises, routineDays, routineExercises, routines, sessions, setEntries, setTargets, users } from "../db/index";

/**
 * Gives an existing account full access plus a sample routine and ~5 weeks of workout history.
 * Usage: npm run db:seed-demo -- <clerk_user_id>
 * Refuses to run on an account that already has a routine or sessions.
 */

const DAY_MS = 86_400_000;

// Base weight (kg) per exercise; it grows ~2.5 kg every other week to give the charts and records something to show.
const PLAN = [
  { letter: "A", title: "Peito e tríceps", exercises: [["Supino reto com barra", 40], ["Supino inclinado com halteres", 16], ["Tríceps na polia (corda)", 20]] },
  { letter: "B", title: "Costas e bíceps", exercises: [["Puxada frontal na polia", 45], ["Remada curvada com barra", 35], ["Rosca direta com barra", 20]] },
  { letter: "C", title: "Legs", exercises: [["Agachamento livre", 40], ["Cadeira extensora", 50], ["Mesa flexora", 40]] },
] as const;

const SETS = 3;
const WEEKS = 5;

async function main() {
  const clerkId = process.argv[2];
  if (!clerkId) throw new Error("Usage: npm run db:seed-demo -- <clerk_user_id>");

  const user = await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) });
  if (!user) throw new Error(`No user with clerk_id ${clerkId}`);
  if (await db.query.routines.findFirst({ where: eq(routines.userId, user.id) })) throw new Error("User already has a routine; refusing to overwrite.");
  if (await db.query.sessions.findFirst({ where: eq(sessions.userId, user.id) })) throw new Error("User already has sessions; refusing to overwrite.");

  const names = PLAN.flatMap((d) => d.exercises.map(([n]) => n));
  const catalog = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(and(inArray(exercises.name, names), isNull(exercises.ownerUserId)));
  const idOf = new Map(catalog.map((e) => [e.name, e.id]));
  const missing = names.filter((n) => !idOf.has(n));
  if (missing.length) throw new Error(`Catalog is missing: ${missing.join(", ")} (run npm run db:seed)`);

  await db.update(users).set({ complimentary: true, trainingDays: [1, 3, 5] }).where(eq(users.id, user.id));

  const [routine] = await db.insert(routines).values({ userId: user.id, version: 1 }).returning({ id: routines.id });
  const days = await db
    .insert(routineDays)
    .values(PLAN.map((d, i) => ({ routineId: routine.id, letter: d.letter, title: d.title, position: i + 1 })))
    .returning({ id: routineDays.id, letter: routineDays.letter });
  const dayId = new Map(days.map((d) => [d.letter, d.id]));
  await db.insert(routineExercises).values(
    PLAN.flatMap((d) => d.exercises.map(([n], i) => ({ dayId: dayId.get(d.letter)!, exerciseId: idOf.get(n)!, order: i + 1, plannedSets: SETS }))),
  );

  // Mon/Wed/Fri rotation A, B, C ... ending on the most recent such day.
  const now = Date.now();
  const dates: Date[] = [];
  for (let back = WEEKS * 7; back >= 1; back--) {
    const d = new Date(now - back * DAY_MS);
    if ([1, 3, 5].includes(d.getUTCDay())) dates.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 13, 0)));
  }

  const lastSets = new Map<string, { id: string; position: number; weight: number; reps: number }[]>();
  for (const [n, startedAt] of dates.entries()) {
    const day = PLAN[n % PLAN.length];
    const week = Math.floor(n / PLAN.length);
    const [session] = await db
      .insert(sessions)
      .values({
        userId: user.id,
        dayId: dayId.get(day.letter)!,
        startedAt,
        endedAt: new Date(startedAt.getTime() + 55 * 60_000),
        closeReason: "user",
        lastSetAt: new Date(startedAt.getTime() + 50 * 60_000),
      })
      .returning({ id: sessions.id });

    const rows = day.exercises.flatMap(([name, base], e) =>
      Array.from({ length: SETS }, (_, s) => {
        // Every other week the load goes up and reps restart at 6; reps climb to 12 within a block.
        const weight = base + Math.floor(week / 2) * 2.5;
        const reps = Math.min(12, 6 + (week % 2) * 2 + s);
        return { sessionId: session.id, exerciseId: idOf.get(name)!, setPosition: s + 1, weight, reps, createdAt: new Date(startedAt.getTime() + (e * 15 + s * 4) * 60_000) };
      }),
    );
    const inserted = await db.insert(setEntries).values(rows).returning({ id: setEntries.id, exerciseId: setEntries.exerciseId, setPosition: setEntries.setPosition, weight: setEntries.weight, reps: setEntries.reps });
    for (const r of inserted) lastSets.set(r.exerciseId, [...(lastSets.get(r.exerciseId) ?? []).filter((x) => x.position !== r.setPosition), { id: r.id, position: r.setPosition, weight: r.weight, reps: r.reps }]);
  }

  // Current targets: repeat the latest set per position (the app recomputes these as the user logs).
  await db.insert(setTargets).values(
    [...lastSets].flatMap(([exerciseId, list]) =>
      list.map((s) => ({ userId: user.id, exerciseId, setPosition: s.position, weight: s.weight, reps: s.reps, sourceEntryId: s.id })),
    ),
  );

  console.log(`Seeded ${user.id}: complimentary access, routine A/B/C and ${dates.length} sessions.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
