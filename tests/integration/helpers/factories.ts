import { randomUUID } from "node:crypto";
import { db, exercises, subscriptions, telegramLinks, users } from "@/db";

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
