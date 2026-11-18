import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db, subscriptions, users, type User } from "@/db";
import { isUniqueViolation } from "@/lib/db-errors";
import { siteUrl } from "@/lib/env";
import { CHECKOUT_URL, DASHBOARD_URL, SETTINGS_URL } from "@/lib/routes";
import { ACCESS_STATUSES, userHasAccess } from "@/lib/services/access";
import { priceId, stripe, type Plan } from "@/lib/stripe";
import { deleteStripeCustomerById } from "@/lib/stripe-customer";

// Stripe is the source of truth: webhooks only say "this subscription changed", and syncSubscription
// reads its current state back, so late or out-of-order deliveries cannot leave stale data behind.

const FINISHED_STATUSES = ["canceled", "incomplete_expired"];

/** The user's Stripe customer, created on first use. The id is saved before Checkout so webhooks can find the user. */
async function ensureCustomer(user: User) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const clerk = await clerkClient();
  const profile = await clerk.users.getUser(user.clerkId);
  const email = profile.primaryEmailAddress?.emailAddress ?? profile.emailAddresses[0]?.emailAddress;
  const customer = await stripe().customers.create(
    { email, name: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || undefined },
    { idempotencyKey: `customer-${user.id}` },
  );
  // Two tabs can race here, and Stripe's idempotency key only lasts about a day. Only fill an empty column:
  // the loser (or a later call) keeps the id that is already saved instead of overwriting it.
  const [saved] = await db
    .update(users)
    .set({ stripeCustomerId: customer.id })
    .where(and(eq(users.id, user.id), isNull(users.stripeCustomerId)))
    .returning({ id: users.stripeCustomerId });
  if (saved?.id) return saved.id;
  const current = await db.query.users.findFirst({ where: eq(users.id, user.id), columns: { stripeCustomerId: true } });
  return current?.stripeCustomerId ?? customer.id;
}

/**
 * Closes an open Checkout Session so it can no longer be paid. When expiry fails, Stripe is asked for the Session's
 * current state: "completed" means it was paid (its subscription is synced), "expired" means it is closed. Anything
 * else (still open, or state unknown because the lookup failed) throws, so no replacement Session is created.
 */
async function closeCheckoutSession(sessionId: string): Promise<"expired" | "completed"> {
  try {
    await stripe().checkout.sessions.expire(sessionId);
    return "expired";
  } catch (expireError) {
    const current = await stripe().checkout.sessions.retrieve(sessionId);
    if (current.status === "expired") return "expired";
    if (current.status === "complete" && current.subscription) {
      await syncSubscription(typeof current.subscription === "string" ? current.subscription : current.subscription.id);
      return "completed";
    }
    throw new Error(`Checkout Session ${sessionId} could not be expired (status: ${current.status})`, { cause: expireError });
  }
}

/**
 * Hosted Checkout for a new subscription, charged right away (no trial). Users who already subscribed get the
 * dashboard instead: a second Checkout would bill them twice.
 */
export async function createCheckoutUrl(user: User, plan: Plan) {
  const dashboard = `${siteUrl()}${DASHBOARD_URL}`;
  if (await userHasAccess(user.id)) return dashboard;
  const customer = await ensureCustomer(user);

  // The webhook may not have landed yet (paid, closed the tab, came back): ask Stripe before opening another Checkout.
  const open = await stripe().subscriptions.list({ customer, limit: 10 });
  const current = open.data.find((s) => ACCESS_STATUSES.includes(s.status));
  if (current) {
    await syncSubscription(current.id);
    return dashboard;
  }

  // The idempotency key below only covers clicks within the same minute. Past that (a double click across the
  // minute boundary, or a click on the other plan), a second payable Session would exist and both can be paid,
  // billing the user twice. Stripe holds the open Sessions, so ask it: reuse the one for this plan and expire the
  // rest, leaving at most one payable Session per customer. (Two requests that both list before either creates
  // still land on the same Session when they share a minute.)
  const openSessions = await stripe().checkout.sessions.list({ customer, status: "open", limit: 10 });
  const reusable = openSessions.data.find((s) => s.metadata?.plan === plan && s.url);
  if (reusable?.url) return reusable.url;
  // A failed expiry is not success: the Session may have been paid in the meantime, or may still be payable. Each
  // one is confirmed closed, or the flow stops before creating a replacement.
  const closures = await Promise.all(openSessions.data.map((s) => closeCheckoutSession(s.id)));
  if (closures.includes("completed")) return dashboard;

  // A double click sends two requests at once, and both would pass the checks above. The idempotency key makes
  // Stripe return the same Session to both. It is bucketed per minute, and also carries the ids of the Sessions this
  // attempt replaced: a plan change (A, then B, then A again within the minute) closes a different set each time,
  // so the key advances and cannot replay a Session that was already expired. Concurrent requests for the same
  // attempt close the same Sessions and still share one key.
  const replaced = openSessions.data.map((s) => s.id).sort().join(",");
  const attempt = replaced ? `-${createHash("sha256").update(replaced).digest("hex").slice(0, 12)}` : "";
  const idempotencyKey = `checkout-${user.id}-${plan}-${Math.floor(Date.now() / 60_000)}${attempt}`;
  const session = await stripe().checkout.sessions.create(
    {
      mode: "subscription",
      customer,
      client_reference_id: user.id,
      // Read back above to tell which plan an open Session is for.
      metadata: { plan },
      line_items: [{ price: priceId(plan), quantity: 1 }],
      locale: "pt-BR",
      success_url: `${siteUrl()}${CHECKOUT_URL}/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      // Back to the plan picker, which does not auto-redirect, so cancelling never loops.
      cancel_url: `${siteUrl()}${CHECKOUT_URL}`,
      // Must be identical across calls sharing an idempotency key, or Stripe rejects the second one.
      integration_identifier: `iron-ai-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 8)}`,
    },
    { idempotencyKey },
  );
  if (!session.url) throw new Error("Stripe returned a Checkout Session without a URL");
  return session.url;
}

/** Customer Portal: cancel, switch plan, update the card, invoices. */
export async function createPortalUrl(user: User) {
  const customer = await ensureCustomer(user);
  const session = await stripe().billingPortal.sessions.create({ customer, return_url: `${siteUrl()}${SETTINGS_URL}` });
  return session.url;
}

/** Deleting the customer cancels its subscriptions immediately, so nobody is billed after deleting the account. */
export async function deleteStripeCustomer(user: User) {
  if (user.stripeCustomerId) await deleteStripeCustomerById(user.stripeCustomerId);
}

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
      Sentry.logger.warn("Stripe subscription for an unknown customer", { subscription_id: sub.id, customer_id: customerId });
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
          // late event of an old subscription cannot overwrite a newer one that is still alive.
          await db
            .insert(subscriptions)
            .values({ userId: user.id, ...row })
            .onConflictDoUpdate({
              target: subscriptions.userId,
              set: row,
              setWhere: and(ne(subscriptions.stripeSubscriptionId, sub.id), inArray(subscriptions.status, FINISHED_STATUSES)),
            })
            .returning({ userId: subscriptions.userId });
    } catch (err) {
      // The success redirect and the webhook sync the same new subscription at the same moment. The loser trips the
      // unique stripe_subscription_id; the row exists now, so go around again and take the update path.
      if (!isUniqueViolation(err)) throw err;
      continue;
    }

    if (written.length > 0) {
      Sentry.logger.info("Subscription synced", { user_id: user.id, status: sub.status, cancel_at_period_end: sub.cancel_at_period_end });
      return true;
    }
    // Nothing written. If this subscription has a row we did not see (or its stamp moved), another sync won: retry.
    // Otherwise the user's row belongs to another live subscription, which an old one must not replace.
    if (!saved && !(await findSavedRow(sub.id))) return true;
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
 */
export async function cancelCustomerSubscriptions(customerId: string) {
  const open = await stripe().subscriptions.list({ customer: customerId, limit: 10 });
  const live = open.data.filter((s) => ACCESS_STATUSES.includes(s.status));
  for (const sub of live) {
    await stripe().subscriptions.cancel(sub.id);
    await syncSubscription(sub.id);
  }
  return live.length;
}

