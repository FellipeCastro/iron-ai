import { logger } from "@sentry/core";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db, subscriptions, users } from "@/db/client";
import { isUniqueViolation } from "@/lib/db-errors";
import { ACCESS_STATUSES } from "@/lib/services/access";
import { stripe } from "@/lib/stripe-client";

// Kept free of Next/Clerk/server-only imports: used by the web app (lib/services/billing.ts re-exports it) and by
// the Trigger.dev worker that processes Stripe webhook events (trigger/stripe-events.ts).
//
// Stripe is the source of truth: webhooks only say "this subscription changed", and syncSubscription
// reads its current state back, so late or out-of-order deliveries cannot leave stale data behind.

const FINISHED_STATUSES = ["canceled", "incomplete_expired"];

const MAX_SYNC_ATTEMPTS = 5;

/**
 * Rewrites the local subscription from Stripe's current state. Returns false when no user owns the customer.
 *
 * Two syncs of one subscription can overlap, and a clock cannot say which Stripe read was newer (ties, skew between
 * servers). So the saved `syncedFrom` is a version stamp that only ever grows, and the write is a compare-and-swap:
 * a sync reads the saved stamp BEFORE asking Stripe and writes only if the stamp is still the same. If another sync
 * saved in between, ours may be older, so it asks Stripe again instead of writing. A winning write therefore always
 * read Stripe after the write it replaces.
 */
export async function syncSubscription(subscriptionId: string) {
  for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt++) {
    const saved = await findSavedRow(subscriptionId);
    const sub = await stripe().subscriptions.retrieve(subscriptionId);
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const user = await db.query.users.findFirst({ where: eq(users.stripeCustomerId, customerId) });
    if (!user) {
      logger.warn("Stripe subscription for an unknown customer", { subscription_id: sub.id, customer_id: customerId });
      return false;
    }

    const item = sub.items.data[0];
    const row = {
      stripeSubscriptionId: sub.id,
      status: sub.status,
      priceId: item.price.id,
      currentPeriodEnd: new Date(item.current_period_end * 1000),
      trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      // Strictly greater than the stamp we read, so the next compare-and-swap never sees a value it saw before.
      syncedFrom: new Date(Math.max(Date.now(), (saved?.syncedFrom?.getTime() ?? 0) + 1)),
    };

    let written: { userId: string }[];
    try {
      written = saved
        ? // This subscription already has a row: replace it only if nobody saved since we looked.
          await db
            .update(subscriptions)
            .set(row)
            .where(
              and(
                eq(subscriptions.stripeSubscriptionId, sub.id),
                saved.syncedFrom ? eq(subscriptions.syncedFrom, saved.syncedFrom) : isNull(subscriptions.syncedFrom),
              ),
            )
            .returning({ userId: subscriptions.userId })
        : // No row for it yet: insert, or take over the user's row once the subscription saved there is finished, so a
          // late event of an old subscription cannot overwrite a newer one that is still alive. A finished incoming
          // subscription never takes over: it is a superseded one (read back from Stripe as canceled), and letting it
          // in would reclaim the row after its replacement was recorded and later finished.
          await db
            .insert(subscriptions)
            .values({ userId: user.id, ...row })
            .onConflictDoUpdate({
              target: subscriptions.userId,
              set: row,
              setWhere: and(
                ne(subscriptions.stripeSubscriptionId, sub.id),
                inArray(subscriptions.status, FINISHED_STATUSES),
                // The incoming status is known here, so a finished one turns the whole condition into "never replace".
                FINISHED_STATUSES.includes(sub.status) ? sql`false` : undefined,
              ),
            })
            .returning({ userId: subscriptions.userId });
    } catch (err) {
      // The success redirect and the webhook sync the same new subscription at the same moment. The loser trips the
      // unique stripe_subscription_id; the row exists now, so go around again and take the update path.
      if (!isUniqueViolation(err)) throw err;
      continue;
    }

    if (written.length > 0) {
      logger.info("Subscription synced", { user_id: user.id, status: sub.status, cancel_at_period_end: sub.cancel_at_period_end });
      return true;
    }
    // Nothing written. If this subscription has a row we did not see (or its stamp moved), another sync won: retry.
    if (saved) continue;
    if (await findSavedRow(sub.id)) continue;
    // A finished subscription never takes over a row, so there is nothing more to do for it.
    if (FINISHED_STATUSES.includes(sub.status)) return true;
    // The user's row belongs to another subscription. Its saved status may be stale (a missed or late webhook), so
    // check Stripe: if it has ended, bring the row up to date and retry saving this one. If it is still alive, an
    // old subscription must not replace it.
    const blocking = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, user.id),
      columns: { stripeSubscriptionId: true, status: true },
    });
    if (!blocking) continue; // the row disappeared meanwhile: insert again
    if (!FINISHED_STATUSES.includes(blocking.status)) {
      const current = await stripe().subscriptions.retrieve(blocking.stripeSubscriptionId);
      if (!FINISHED_STATUSES.includes(current.status)) return true;
      await syncSubscription(blocking.stripeSubscriptionId);
    }
  }
  throw new Error(`Could not sync subscription ${subscriptionId}: it kept changing under concurrent syncs`);
}

/** The row saved for a subscription, if any. Its `syncedFrom` is the stamp (null on rows saved before it existed). */
function findSavedRow(subscriptionId: string) {
  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, subscriptionId),
    columns: { syncedFrom: true },
  });
}

/**
 * Stops billing a customer after a dispute or a full refund: cancels every live subscription right away and
 * syncs the result so access ends now. Returns how many subscriptions were cancelled.
 *
 * `operationId` names the business operation that asked for it (the Stripe event id). Each cancel carries an
 * idempotency key built from it, so a retry of the same operation gets Stripe's saved answer instead of cancelling
 * again (or failing on an already-cancelled subscription).
 */
export async function cancelCustomerSubscriptions(customerId: string, operationId: string) {
  const open = await stripe().subscriptions.list({ customer: customerId, limit: 10 });
  const live = open.data.filter((s) => ACCESS_STATUSES.includes(s.status));
  for (const sub of live) {
    await stripe().subscriptions.cancel(sub.id, {}, { idempotencyKey: `risk-cancel-${operationId}-${sub.id}` });
    await syncSubscription(sub.id);
  }
  return live.length;
}
