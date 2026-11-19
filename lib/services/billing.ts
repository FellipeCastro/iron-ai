import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { and, eq, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db, users, type User } from "@/db";
import { siteUrl } from "@/lib/env";
import { CHECKOUT_URL, DASHBOARD_URL, SETTINGS_URL } from "@/lib/routes";
import { ACCESS_STATUSES, userHasAccess } from "@/lib/services/access";
import { priceId, stripe, type Plan } from "@/lib/stripe";
import { deleteStripeCustomerById } from "@/lib/stripe-customer";
import { syncSubscription } from "@/lib/subscription-sync";

// The sync itself lives in lib/subscription-sync.ts so the Trigger.dev worker can run it too.
export { cancelCustomerSubscriptions, syncSubscription } from "@/lib/subscription-sync";

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
export async function createCheckoutUrl(user: User, plan: Plan, attemptKey?: string) {
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
  //
  // When the caller holds an app-level idempotency claim (`attemptKey`), that key IS the Stripe key. A takeover of a
  // stale claim re-runs this function while the original create may still be in flight or commit later; a key derived
  // from the clock or from the Sessions listed above could differ between the two runs and open a second payable
  // Session. The claim's key is the same for both, so Stripe hands the takeover the original Session.
  const replaced = openSessions.data.map((s) => s.id).sort().join(",");
  const attempt = replaced ? `-${createHash("sha256").update(replaced).digest("hex").slice(0, 12)}` : "";
  const idempotencyKey = attemptKey
    ? `checkout-${user.id}-${plan}-${attemptKey}`
    : `checkout-${user.id}-${plan}-${Math.floor(Date.now() / 60_000)}${attempt}`;
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

/**
 * A saved idempotent answer may hold a Checkout URL that has since expired. Returns the URL to send the user to, or
 * null when the saved Session is expired and the user is not subscribed (the caller must start a new attempt; the saved
 * record is left untouched). A paid Session, or a user who already has access, goes to the dashboard instead.
 */
export async function usableCheckoutUrl(user: User, savedUrl: string): Promise<string | null> {
  const sessionId = /\/(cs_(?:test|live)_[A-Za-z0-9]+)/.exec(new URL(savedUrl).pathname)?.[1];
  if (!sessionId) return savedUrl; // not a Checkout Session URL (e.g. the dashboard)
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  if (session.status === "open") return savedUrl;
  if (session.status === "complete" && session.subscription) {
    await syncSubscription(typeof session.subscription === "string" ? session.subscription : session.subscription.id);
    return `${siteUrl()}${DASHBOARD_URL}`;
  }
  return (await userHasAccess(user.id)) ? `${siteUrl()}${DASHBOARD_URL}` : null;
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
