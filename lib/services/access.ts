import { eq } from "drizzle-orm";
import { db, subscriptions, users } from "@/db";

// Who may use the product. Kept free of Next/Clerk imports: the Telegram bot and the reminder tick run in
// Trigger.dev, outside the web app.

/** Statuses that keep the product unlocked. past_due stays on while Stripe retries the card. */
export const ACCESS_STATUSES = ["trialing", "active", "past_due"];

/** `complimentary` accounts (created before billing launched) never need a subscription. */
export const hasAccess = (sub: { status: string } | null | undefined, complimentary = false) =>
  complimentary || Boolean(sub && ACCESS_STATUSES.includes(sub.status));

export const findSubscription = (userId: string) => db.query.subscriptions.findFirst({ where: eq(subscriptions.userId, userId) });

export async function userHasAccess(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { complimentary: true }, with: { subscription: true } });
  return Boolean(user) && hasAccess(user!.subscription, user!.complimentary);
}
