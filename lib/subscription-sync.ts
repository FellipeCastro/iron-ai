import { logger } from "@sentry/core";
import { and, eq, isNull, ne, notInArray, sql } from "drizzle-orm";
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
 * Rewrites the local subscription from Stripe's current state. Returns the Stripe customer id, or null when no user
 * owns the customer.
 *
 * Two syncs of one subscription can overlap, and a clock cannot say which Stripe read was newer (ties, skew between
 * servers). So the saved `syncedFrom` is a version stamp that only ever grows, and the write is a compare-and-swap:
 * a sync reads the saved stamp BEFORE asking Stripe and writes only if the stamp is still the same. If another sync
 * saved in between, ours may be older, so it asks Stripe again instead of writing. A winning write therefore always
 * read Stripe after the write it replaces.
 */
export async function syncSubscription(subscriptionId: string): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt++) {
    const saved = await findSavedRow(subscriptionId);
    const sub = await stripe().subscriptions.retrieve(subscriptionId);
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const user = await db.query.users.findFirst({ where: eq(users.stripeCustomerId, customerId) });
    if (!user) {
      logger.warn("Stripe subscription for an unknown customer", { subscription_id: sub.id, customer_id: customerId });
      return null;
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
                notInArray(subscriptions.status, ACCESS_STATUSES),
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
      return customerId;
    }
    // Nothing written. If this subscription has a row we did not see (or its stamp moved), another sync won: retry.
    if (saved) continue;
    if (await findSavedRow(sub.id)) continue;
    // A finished subscription never takes over a row, so there is nothing more to do for it.
    if (FINISHED_STATUSES.includes(sub.status)) return customerId;
    // The user's row belongs to another subscription. Its saved status may be stale (a missed or late webhook), so
    // check Stripe: if it has ended, bring the row up to date and retry saving this one. If it is still alive, an
    // old subscription must not replace it. Two live subscriptions are a double charge: the Stripe event task
    // (cancelDuplicateSubscriptions) cancels and refunds the newer one.
    const blocking = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, user.id),
      columns: { stripeSubscriptionId: true, status: true },
    });
    if (!blocking) continue; // the row disappeared meanwhile: insert again
    // Same rule as checkout: only a row that still grants access blocks. A row that does not (finished, unpaid,
    // incomplete) is replaceable, so the insert is retried.
    if (ACCESS_STATUSES.includes(blocking.status)) {
      const current = await stripe().subscriptions.retrieve(blocking.stripeSubscriptionId);
      if (ACCESS_STATUSES.includes(current.status)) return customerId;
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

/**
 * A customer may hold one live subscription. A second one (two Checkouts paid, e.g. before the one-Session-per-user
 * guard, or a Session paid on a stale tab) bills the user twice, and syncSubscription keeps only one of them locally.
 * Keeps the oldest live subscription; each newer one is cancelled right away and its latest invoice refunded in full.
 * Returns what this call cancelled (empty when nothing was duplicated, or another run already handled it).
 *
 * `operationId` names the business operation (the Stripe event id): the cancel and refund idempotency keys are built
 * from it, so a retry of the same event replays Stripe's saved answers. Runs of two events of the same customer may
 * race: only the one whose cancel succeeds refunds and reports it; the other sees the subscription already canceled.
 */
export async function cancelDuplicateSubscriptions(customerId: string, operationId: string) {
  const all = await stripe().subscriptions.list({ customer: customerId, limit: 10 });
  const live = all.data
    .filter((s) => ACCESS_STATUSES.includes(s.status))
    .sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const [kept, ...duplicates] = live;
  const cancelled: { subscriptionId: string; refundedAmount: number }[] = [];
  for (const sub of duplicates) {
    if (!(await cancelOnce(sub.id, `duplicate-cancel-${operationId}-${sub.id}`))) continue;
    const refundedAmount = await refundLatestInvoice(sub, operationId);
    await syncSubscription(sub.id);
    cancelled.push({ subscriptionId: sub.id, refundedAmount });
  }
  // The cancelled one may have held the local row: let the kept one take it back.
  if (kept && duplicates.length > 0) await syncSubscription(kept.id);
  if (cancelled.length > 0) {
    logger.warn("Duplicate subscriptions cancelled", {
      customer_id: customerId,
      kept_subscription_id: kept.id,
      cancelled: cancelled.map((c) => c.subscriptionId).join(","),
    });
  }
  return { keptSubscriptionId: kept?.id ?? null, cancelled };
}

/** Cancels now. False when someone else (another event's run) already canceled it: that run owns the refund. */
async function cancelOnce(subscriptionId: string, idempotencyKey: string) {
  try {
    await stripe().subscriptions.cancel(subscriptionId, {}, { idempotencyKey });
    return true;
  } catch (err) {
    const current = await stripe().subscriptions.retrieve(subscriptionId);
    if (current.status === "canceled") return false;
    throw err;
  }
}

/** Refund metadata key set by cancelDuplicateSubscriptions (value: the cancelled subscription id). */
export const DUPLICATE_REFUND_METADATA = "iron_ai_duplicate_subscription";

/** Refunds every paid payment of the subscription's latest invoice (its first and only charge). Returns the amount. */
async function refundLatestInvoice(sub: { id: string; latest_invoice: string | { id?: string } | null }, operationId: string) {
  const invoice = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
  if (!invoice) return 0;
  const payments = await stripe().invoicePayments.list({ invoice, status: "paid", limit: 10 });
  let refunded = 0;
  for (const { payment } of payments.data) {
    const paymentIntent = typeof payment.payment_intent === "string" ? payment.payment_intent : payment.payment_intent?.id;
    if (!paymentIntent) continue;
    try {
      const refund = await stripe().refunds.create(
        // The metadata tells the charge.refunded handler this refund is ours, so it does not cancel the kept subscription.
        { payment_intent: paymentIntent, reason: "duplicate", metadata: { [DUPLICATE_REFUND_METADATA]: sub.id } },
        { idempotencyKey: `duplicate-refund-${operationId}-${paymentIntent}` },
      );
      refunded += refund.amount;
    } catch (err) {
      // Refunded by hand meanwhile: nothing left to give back.
      if ((err as { code?: string }).code !== "charge_already_refunded") throw err;
    }
  }
  return refunded;
}

/** True when the charge has refunds and every one of them was made by cancelDuplicateSubscriptions. */
export async function refundedOnlyForDuplicate(chargeId: string) {
  const refunds = await stripe().refunds.list({ charge: chargeId, limit: 10 });
  return refunds.data.length > 0 && refunds.data.every((r) => Boolean(r.metadata?.[DUPLICATE_REFUND_METADATA]));
}
