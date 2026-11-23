import { eq } from "drizzle-orm";
import { db, subscriptions, users } from "@/db/client";

// Who may use the product. Kept free of Next/Clerk imports: the Telegram bot and the reminder tick run in
// Trigger.dev, outside the web app.

/** Statuses that keep the product unlocked. past_due stays on while Stripe retries the card, up to PAST_DUE_GRACE_MS. */
export const ACCESS_STATUSES = ["trialing", "active", "past_due"];

/** Statuses whose access also ends when the paid period ends. */
const PERIOD_BOUND_STATUSES = ["trialing", "active"];

/**
 * How long past_due keeps access. Counted from the start of the unpaid period: on renewal Stripe moves the period
 * forward before charging, so a past_due subscription's current_period_end is the end of a period nobody paid for.
 *
 * Policy: one grace window per unpaid billing period, not per delinquency. If Stripe is still retrying when the next
 * period starts, current_period_start moves forward and a new window opens. That can only happen when the Stripe
 * retry schedule (Dashboard > Billing > failed payments) is longer than a billing period, so keep it shorter and end
 * the subscription (cancel or unpaid) after the final retry. Once the window closes, the user pays the open invoice
 * through the billing flow (lib/services/billing.ts, recoveryUrl).
 */
export const PAST_DUE_GRACE_MS = 7 * 86_400_000;

type AccessSubscription = {
  status: string;
  currentPeriodStart?: Date | null;
  currentPeriodEnd: Date;
  updatedAt?: Date | null;
};

/** `complimentary` accounts (created before billing launched) never need a subscription. */
export const hasAccess = (sub: AccessSubscription | null | undefined, complimentary = false) => {
  if (complimentary) return true;
  if (!sub || !ACCESS_STATUSES.includes(sub.status)) return false;
  const now = Date.now();
  if (sub.status === "past_due") {
    // Rows synced before current_period_start existed fall back to the last sync, which is at or after the renewal
    // failure; the next Stripe event fills the real value in.
    const since = sub.currentPeriodStart ?? sub.updatedAt;
    return since != null && since.getTime() + PAST_DUE_GRACE_MS > now;
  }
  // Guards against a missed/late Stripe webhook leaving a lapsed subscription as "active".
  return !PERIOD_BOUND_STATUSES.includes(sub.status) || sub.currentPeriodEnd.getTime() > now;
};

export const findSubscription = (userId: string) => db.query.subscriptions.findFirst({ where: eq(subscriptions.userId, userId) });

export async function userHasAccess(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { complimentary: true }, with: { subscription: true } });
  return Boolean(user) && hasAccess(user!.subscription, user!.complimentary);
}
