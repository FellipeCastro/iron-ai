import { eq } from "drizzle-orm";
import { db, subscriptions, users } from "@/db";

// Who may use the product. Kept free of Next/Clerk imports: the Telegram bot and the reminder tick run in
// Trigger.dev, outside the web app.

/** Statuses that keep the product unlocked. past_due stays on while Stripe retries the card. */
export const ACCESS_STATUSES = ["trialing", "active", "past_due"];

/** Statuses whose access also ends when the paid period ends. past_due is exempt: its period is already over while Stripe retries the card. */
const PERIOD_BOUND_STATUSES = ["trialing", "active"];

/** `complimentary` accounts (created before billing launched) never need a subscription. */
export const hasAccess = (sub: { status: string; currentPeriodEnd: Date } | null | undefined, complimentary = false) => {
  if (complimentary) return true;
  if (!sub || !ACCESS_STATUSES.includes(sub.status)) return false;
  // Guards against a missed/late Stripe webhook leaving a lapsed subscription as "active".
  return !PERIOD_BOUND_STATUSES.includes(sub.status) || sub.currentPeriodEnd.getTime() > Date.now();
};

export const findSubscription = (userId: string) => db.query.subscriptions.findFirst({ where: eq(subscriptions.userId, userId) });

export async function userHasAccess(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { complimentary: true }, with: { subscription: true } });
  return Boolean(user) && hasAccess(user!.subscription, user!.complimentary);
}
