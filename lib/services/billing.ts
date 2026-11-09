import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { eq, inArray, or } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, subscriptions, users, type User } from "@/db";
import { ANNUAL_INSTALLMENT_PRICE, brl } from "@/lib/plans";
import { COMMITMENT_MONTHS, commitmentEnd } from "@/lib/commitment";
import { requireEnv, siteUrl } from "@/lib/env";
import { CHECKOUT_URL, DASHBOARD_URL, SETTINGS_URL } from "@/lib/routes";
import { ACCESS_STATUSES, findSubscription, userHasAccess } from "@/lib/services/access";
import { hasCommitment, priceId, stripe, type Plan } from "@/lib/stripe";

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

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price: priceId(plan), quantity: 1 }],
    subscription_data: { metadata: { plan } },
    // Shown above the pay button: the commitment is part of what the customer agrees to.
    ...(plan === "annual" && {
      custom_text: {
        submit: {
          message: `Plano anual: ${COMMITMENT_MONTHS} parcelas mensais de ${brl(ANNUAL_INSTALLMENT_PRICE)}, com fidelidade de ${COMMITMENT_MONTHS} meses. Renova por mais ${COMMITMENT_MONTHS} meses se você não cancelar.`,
        },
      },
    }),
    locale: "pt-BR",
    success_url: `${siteUrl()}${CHECKOUT_URL}/sucesso?session_id={CHECKOUT_SESSION_ID}`,
    // Back to the plan picker, which does not auto-redirect, so cancelling never loops.
    cancel_url: `${siteUrl()}${CHECKOUT_URL}`,
    integration_identifier: `iron-ai-${randomLetters(8)}`,
  });
  if (!session.url) throw new Error("Stripe returned a Checkout Session without a URL");
  return session.url;
}

/**
 * Customer Portal: card, invoices and (outside a commitment) cancellation. Annual subscribers past the trial get
 * STRIPE_PORTAL_CONFIG_COMMITMENT, which cannot cancel: they cancel the renewal in Settings instead, which ends
 * the subscription at the end of the 12-month cycle. Everyone else gets STRIPE_PORTAL_CONFIG_STANDARD (or the
 * account's default portal when unset).
 */
export async function createPortalUrl(user: User) {
  const customer = await ensureCustomer(user);
  const sub = await findSubscription(user.id);
  const committed = sub && hasCommitment(sub.priceId) && sub.status !== "trialing" && ACCESS_STATUSES.includes(sub.status);
  const configuration = committed ? requireEnv("STRIPE_PORTAL_CONFIG_COMMITMENT") : process.env.STRIPE_PORTAL_CONFIG_STANDARD || undefined;
  const session = await stripe().billingPortal.sessions.create({ customer, configuration, return_url: `${siteUrl()}${SETTINGS_URL}` });
  return session.url;
}

export class NotRenewableError extends Error {
  constructor() {
    super("No live annual-plan subscription to change");
  }
}

/**
 * Annual plan: stops the renewal. During the trial nothing was billed, so it ends with the trial; afterwards the
 * installments continue until the end of the 12-month cycle, when access ends. Returns the end date.
 */
export async function cancelRenewal(user: User) {
  const local = await findSubscription(user.id);
  if (!local || !hasCommitment(local.priceId) || !ACCESS_STATUSES.includes(local.status)) throw new NotRenewableError();
  const sub = await stripe().subscriptions.retrieve(local.stripeSubscriptionId);
  const end = sub.status === "trialing" ? null : commitmentEnd(new Date(sub.billing_cycle_anchor * 1000));
  await stripe().subscriptions.update(
    sub.id,
    // The cycle end is a period end, so "none" only guards against a stray proration.
    end ? { cancel_at: Math.floor(end.getTime() / 1000), proration_behavior: "none" } : { cancel_at_period_end: true },
  );
  await syncSubscription(sub.id);
  Sentry.logger.info("Renewal cancelled", { user_id: user.id, during_trial: !end });
}

/** Undoes cancelRenewal: the subscription renews again. */
export async function resumeRenewal(user: User) {
  const local = await findSubscription(user.id);
  if (!local || !hasCommitment(local.priceId) || !ACCESS_STATUSES.includes(local.status)) throw new NotRenewableError();
  // Stripe takes one of the two per request: undo whichever cancelRenewal set.
  await stripe().subscriptions.update(local.stripeSubscriptionId, local.cancelAtPeriodEnd ? { cancel_at_period_end: false } : { cancel_at: "" });
  await syncSubscription(local.stripeSubscriptionId);
  Sentry.logger.info("Renewal resumed", { user_id: user.id });
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
    cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
    commitmentEnd: hasCommitment(item.price.id) ? commitmentEnd(new Date(sub.billing_cycle_anchor * 1000)) : null,
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

function randomLetters(length: number) {
  return Array.from(randomBytes(length), (b) => String.fromCharCode(97 + (b % 26))).join("");
}
