import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { eq, inArray, or } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, subscriptions, users, type User } from "@/db";
import { TRIAL_DAYS } from "@/components/landing/pricing";
import { siteUrl } from "@/lib/env";
import { CHECKOUT_URL, DASHBOARD_URL, SETTINGS_URL } from "@/lib/routes";
import { ACCESS_STATUSES, userHasAccess } from "@/lib/services/access";
import { priceId, stripe, type Plan } from "@/lib/stripe";

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
  // Two tabs can race here; the unique column plus the idempotency key make both converge on one customer.
  const [saved] = await db.update(users).set({ stripeCustomerId: customer.id }).where(eq(users.id, user.id)).returning({ id: users.stripeCustomerId });
  return saved?.id ?? customer.id;
}

/**
 * Hosted Checkout for a new subscription with the free trial. Users who already subscribed get the
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

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price: priceId(plan), quantity: 1 }],
    subscription_data: { trial_period_days: TRIAL_DAYS },
    locale: "pt-BR",
    success_url: `${siteUrl()}${CHECKOUT_URL}/sucesso?session_id={CHECKOUT_SESSION_ID}`,
    // Back to the plan picker, which does not auto-redirect, so cancelling never loops.
    cancel_url: `${siteUrl()}${CHECKOUT_URL}`,
    integration_identifier: `iron-ai-${randomLetters(8)}`,
  });
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
  if (user.stripeCustomerId) await stripe().customers.del(user.stripeCustomerId);
}

/** Rewrites the local subscription from Stripe's current state. Returns false when no user owns the customer. */
export async function syncSubscription(subscriptionId: string) {
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
  };
  await db
    .insert(subscriptions)
    .values({ userId: user.id, ...row })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: row,
      // A late event of an old subscription must not overwrite a newer one that is still alive.
      setWhere: or(eq(subscriptions.stripeSubscriptionId, sub.id), inArray(subscriptions.status, FINISHED_STATUSES)),
    });
  Sentry.logger.info("Subscription synced", { user_id: user.id, status: sub.status, cancel_at_period_end: sub.cancel_at_period_end });
  return true;
}

function randomLetters(length: number) {
  return Array.from(randomBytes(length), (b) => String.fromCharCode(97 + (b % 26))).join("");
}
