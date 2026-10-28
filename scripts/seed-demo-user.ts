import "../db/env";
import { createClerkClient } from "@clerk/backend";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  exercises,
  routineDays,
  routineExercises,
  routines,
  sessions,
  setEntries,
  setTargets,
  subscriptions,
  users,
} from "../db";

// Demo account for local testing: a Clerk user (dev instance) plus a filled-in app profile —
// active subscription, 3-day routine and six weeks of training history. Safe to re-run: the app user is recreated.

const EMAIL = "demo+clerk_test@ironai.dev"; // "+clerk_test" emails accept the code 424242 on Clerk dev instances
const PASSWORD = "IronAi-Demo-2026!";
const WEEKS = 6;

// Weekdays are ISO (1 = Monday). Each plan: [exercise name, planned sets, starting kg, reps, kg added per week].
const PLAN: { title: string; exercises: [string, number, number, number, number][] }[] = [
  {
    title: "Peito e tríceps",
    exercises: [
      ["Supino reto com barra", 4, 60, 8, 2.5],
      ["Supino inclinado com halteres", 3, 22, 10, 1],
      ["Crucifixo com halteres", 3, 14, 12, 0],
      ["Tríceps na polia (corda)", 3, 25, 12, 1.25],
      ["Tríceps testa", 3, 25, 10, 1.25],
    ],
  },
  {
    title: "Costas e bíceps",
    exercises: [
      ["Puxada frontal na polia", 4, 55, 10, 2.5],
      ["Remada curvada com barra", 4, 50, 8, 2.5],
      ["Remada baixa na polia", 3, 50, 10, 2.5],
      ["Rosca direta com barra", 3, 30, 10, 1.25],
      ["Rosca martelo", 3, 14, 12, 1],
    ],
  },
  {
    title: "Pernas e ombros",
    exercises: [
      ["Agachamento livre", 4, 70, 8, 5],
      ["Cadeira extensora", 3, 45, 12, 2.5],
      ["Mesa flexora", 3, 35, 12, 2.5],
      ["Desenvolvimento com halteres", 3, 20, 10, 1],
      ["Elevação lateral com halteres", 3, 8, 12, 0],
    ],
  },
];

async function ensureClerkUser() {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const { data } = await clerk.users.getUserList({ emailAddress: [EMAIL] });
  if (data[0]) {
    await clerk.users.updateUser(data[0].id, { password: PASSWORD, skipPasswordChecks: true });
    return { id: data[0].id, created: false };
  }
  const user = await clerk.users.createUser({
    emailAddress: [EMAIL],
    password: PASSWORD,
    firstName: "Demo",
    lastName: "Iron",
    skipPasswordChecks: true,
  });
  return { id: user.id, created: true };
}

async function main() {
  const clerkUser = await ensureClerkUser();

  // Recreate the app user so the seed is repeatable (everything else cascades from it).
  await db.delete(users).where(eq(users.clerkId, clerkUser.id));
  const [user] = await db
    .insert(users)
    .values({
      clerkId: clerkUser.id,
      timezone: "America/Sao_Paulo",
      reminderTime: "18:30:00",
      trainingDays: [1, 3, 5],
      weightIncrementKg: 2.5,
    })
    .returning();

  const now = new Date();
  await db.insert(subscriptions).values({
    userId: user.id,
    stripeSubscriptionId: `sub_demo_${user.id.slice(0, 8)}`,
    status: "active",
    priceId: process.env.STRIPE_PRICE_MONTHLY ?? "price_demo",
    currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
  });

  // Routine v1.
  const names = PLAN.flatMap((d) => d.exercises.map((e) => e[0]));
  const catalog = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(and(inArray(exercises.name, names), isNull(exercises.ownerUserId)));
  const idByName = new Map(catalog.map((e) => [e.name, e.id]));
  const missing = names.filter((n) => !idByName.has(n));
  if (missing.length) throw new Error(`Exercícios fora do catálogo (rode npm run db:seed): ${missing.join(", ")}`);

  const [routine] = await db.insert(routines).values({ userId: user.id, version: 1 }).returning({ id: routines.id });
  const days = await db
    .insert(routineDays)
    .values(PLAN.map((d, i) => ({ routineId: routine.id, letter: "ABC"[i], title: d.title, position: i + 1 })))
    .returning({ id: routineDays.id, position: routineDays.position });
  const dayId = (i: number) => days.find((d) => d.position === i + 1)!.id;
  await db.insert(routineExercises).values(
    PLAN.flatMap((d, i) =>
      d.exercises.map(([name, sets], order) => ({ dayId: dayId(i), exerciseId: idByName.get(name)!, order: order + 1, plannedSets: sets })),
    ),
  );

  // History: Mon/Wed/Fri for the last WEEKS weeks, cycling A→B→C, ending before today. Weight grows by week.
  const start = new Date(now);
  start.setUTCHours(21, 30, 0, 0); // 18:30 in São Paulo
  start.setUTCDate(start.getUTCDate() - WEEKS * 7);
  let sessionIdx = 0;
  const lastBySet = new Map<string, { exerciseId: string; position: number; weight: number; reps: number; entryId: string }>();
  for (let d = 0; d < WEEKS * 7; d++) {
    const date = new Date(start.getTime() + d * 86_400_000);
    const isoWeekday = ((date.getUTCDay() + 6) % 7) + 1;
    if (![1, 3, 5].includes(isoWeekday) || date >= now) continue;

    const planIdx = sessionIdx % PLAN.length;
    const week = Math.floor(d / 7);
    const [session] = await db
      .insert(sessions)
      .values({
        userId: user.id,
        dayId: dayId(planIdx),
        startedAt: date,
        endedAt: new Date(date.getTime() + 62 * 60_000),
        closeReason: "complete",
        lastSetAt: new Date(date.getTime() + 58 * 60_000),
        summarySentAt: new Date(date.getTime() + 63 * 60_000),
      })
      .returning({ id: sessions.id });

    let minute = 0;
    const rows = PLAN[planIdx].exercises.flatMap(([name, sets, base, reps, step]) =>
      Array.from({ length: sets }, (_, s) => ({
        sessionId: session.id,
        exerciseId: idByName.get(name)!,
        setPosition: s + 1,
        weight: base + step * week,
        // Reps slip a little on later sets, like a real workout.
        reps: Math.max(4, reps - (s > 1 ? s - 1 : 0)),
        createdAt: new Date(date.getTime() + minute++ * 3 * 60_000),
      })),
    );
    const inserted = await db.insert(setEntries).values(rows).returning({ id: setEntries.id, exerciseId: setEntries.exerciseId, setPosition: setEntries.setPosition, weight: setEntries.weight, reps: setEntries.reps });
    for (const e of inserted) {
      lastBySet.set(`${e.exerciseId}:${e.setPosition}`, { exerciseId: e.exerciseId, position: e.setPosition, weight: e.weight, reps: e.reps, entryId: e.id });
    }
    sessionIdx++;
  }

  // Next-session targets: the latest logged set per exercise/position.
  await db.insert(setTargets).values(
    [...lastBySet.values()].map((t) => ({
      userId: user.id,
      exerciseId: t.exerciseId,
      setPosition: t.position,
      weight: t.weight,
      reps: t.reps,
      sourceEntryId: t.entryId,
    })),
  );

  console.log(`Clerk user ${clerkUser.created ? "criado" : "já existia (senha redefinida)"}: ${clerkUser.id}`);
  console.log(`App user: ${user.id} · ${sessionIdx} treinos, ${lastBySet.size} metas, assinatura ativa`);
  console.log(`\n  E-mail: ${EMAIL}\n  Senha:  ${PASSWORD}\n  Código de verificação (se pedido): 424242`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
