import { randomUUID } from "node:crypto";
import { db, exercises, sessions, setEntries, subscriptions, telegramLinks, users } from "@/db";

// Linhas no banco real, direto pelo Drizzle (sem passar pelas actions que estão sendo testadas).

let seq = 0;
const next = () => ++seq;

export async function createUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await db
    .insert(users)
    .values({ clerkId: `user_${randomUUID()}`, ...overrides })
    .returning();
  return user;
}

type SubscriptionOverrides = Partial<Omit<typeof subscriptions.$inferInsert, "userId">>;

/** Assinatura local. Por padrão: `active`, vence em 30 dias. */
export async function createSubscription(userId: string, overrides: SubscriptionOverrides = {}) {
  const [sub] = await db
    .insert(subscriptions)
    .values({
      userId,
      stripeSubscriptionId: `sub_${randomUUID()}`,
      status: "active",
      priceId: process.env.STRIPE_PRICE_MONTHLY!,
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      ...overrides,
    })
    .returning();
  return sub;
}

/** Usuário com assinatura local no status dado (ou sem assinatura se `status` for null). */
export async function createSubscribedUser(status: string | null = "active", overrides: Partial<typeof users.$inferInsert> = {}) {
  const user = await createUser(overrides);
  const subscription = status ? await createSubscription(user.id, { status }) : null;
  return { user, subscription };
}

export async function linkTelegram(userId: string, chatId = 1_000_000 + next(), username: string | null = null) {
  const [link] = await db.insert(telegramLinks).values({ userId, chatId, username }).returning();
  return link;
}

/** Exercício do catálogo global (`ownerUserId` omitido) ou personalizado de um usuário. */
export async function createExercise(overrides: Partial<typeof exercises.$inferInsert> = {}) {
  const [exercise] = await db
    .insert(exercises)
    .values({ name: `Exercício ${next()}`, muscleGroup: "peito", ...overrides })
    .returning();
  return exercise;
}

/** Sessão encerrada (por padrão, há 1 dia, com 60 min). `open: true` cria uma sessão ainda aberta. */
export async function createSession(userId: string, overrides: Partial<typeof sessions.$inferInsert> & { open?: boolean } = {}) {
  const { open, ...rest } = overrides;
  const startedAt = rest.startedAt ?? new Date(Date.now() - 86_400_000);
  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      startedAt,
      lastSetAt: startedAt,
      ...(open ? {} : { endedAt: new Date(startedAt.getTime() + 60 * 60_000), closeReason: "user" as const }),
      ...rest,
    })
    .returning();
  return session;
}

/** Série válida numa sessão. */
export async function createSet(sessionId: string, exerciseId: string, overrides: Partial<typeof setEntries.$inferInsert> = {}) {
  const [set] = await db
    .insert(setEntries)
    .values({ sessionId, exerciseId, setPosition: 1, weight: 80, reps: 8, ...overrides })
    .returning();
  return set;
}
