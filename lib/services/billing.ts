import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { checkoutSlots, db, users, type User } from "@/db";
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

/** Another checkout of the same user is still running (another tab) and did not finish while this one waited. */
export class CheckoutInProgressError extends Error {
  constructor() {
    super("Another checkout of this user is still in progress");
    this.name = "CheckoutInProgressError";
  }
}

// A lease older than this belongs to a request that died (or hangs): another one may take it over. The Stripe key is
// the generation, not the lease, so a takeover while the old holder is still alive cannot open a second Session.
const CHECKOUT_LEASE = sql`interval '30 seconds'`;
const CHECKOUT_WAIT_MS = 10_000;
const CHECKOUT_POLL_MS = 150;
// A Session returned by `create` that is older than this is a replay of an earlier attempt (Stripe keeps the answer
// of an idempotency key for a day): it is checked before being handed out, since it may have expired or been paid.
const REPLAY_AGE_S = 60;

type CheckoutSlot = { token: string; generation: number; sessionId: string | null };

/** Takes the user's checkout lease, waiting while another request holds it. */
async function acquireCheckoutSlot(userId: string): Promise<CheckoutSlot> {
  const deadline = Date.now() + CHECKOUT_WAIT_MS;
  for (;;) {
    const token = randomUUID();
    const [slot] = await db
      .insert(checkoutSlots)
      .values({ userId, leaseToken: token, leasedAt: sql`now()` })
      .onConflictDoUpdate({
        target: checkoutSlots.userId,
        set: { leaseToken: token, leasedAt: sql`now()` },
        setWhere: or(isNull(checkoutSlots.leaseToken), sql`${checkoutSlots.leasedAt} < now() - ${CHECKOUT_LEASE}`),
      })
      .returning({ generation: checkoutSlots.generation, sessionId: checkoutSlots.sessionId });
    if (slot) return { token, ...slot };
    if (Date.now() > deadline) throw new CheckoutInProgressError();
    await new Promise((resolve) => setTimeout(resolve, CHECKOUT_POLL_MS));
  }
}

const heldBy = (userId: string, token: string) => and(eq(checkoutSlots.userId, userId), eq(checkoutSlots.leaseToken, token));

/**
 * Moves to a fresh Stripe key. Only called once no Session of the current generation is open any more. Throws if the
 * lease was taken over meanwhile: the new holder decides, and this request must not create anything.
 */
async function advanceGeneration(userId: string, slot: CheckoutSlot) {
  const [row] = await db
    .update(checkoutSlots)
    .set({ generation: sql`${checkoutSlots.generation} + 1`, sessionId: null, leasedAt: sql`now()` })
    .where(heldBy(userId, slot.token))
    .returning({ generation: checkoutSlots.generation });
  if (!row) throw new CheckoutInProgressError();
  slot.generation = row.generation;
  slot.sessionId = null;
}

/**
 * Hosted Checkout for a new subscription, charged right away (no trial). Users who already subscribed get the
 * dashboard instead: a second Checkout would bill them twice.
 *
 * At most one payable Session exists per user, whatever idempotency key each request carries. Requests of one user
 * run one at a time (the `checkout_slots` lease), so the second tab sees the first tab's Session: it reuses it (same
 * plan) or expires it before opening its own. The Stripe key comes from the row's generation, so a request that
 * outlives its lease and the one that took over still share a key, and Stripe opens a single Session for both.
 */
export async function createCheckoutUrl(user: User, plan: Plan) {
  const dashboard = `${siteUrl()}${DASHBOARD_URL}`;
  if (await userHasAccess(user.id)) return dashboard;
  const customer = await ensureCustomer(user);

  const slot = await acquireCheckoutSlot(user.id);
  let result: { url: string; sessionId: string | null };
  try {
    result = await openCheckout(user, plan, customer, slot);
  } catch (err) {
    await releaseCheckoutSlot(user.id, slot, null);
    throw err;
  }
  // Lease lost while this request ran: the request that took over may have expired this Session (other plan). Never
  // hand out a URL that can no longer be paid.
  const held = await releaseCheckoutSlot(user.id, slot, result.sessionId);
  if (!held && result.sessionId && (await stripe().checkout.sessions.retrieve(result.sessionId)).status !== "open") {
    throw new CheckoutInProgressError();
  }
  return result.url;
}

/** The body of createCheckoutUrl, run while holding the user's checkout lease. `sessionId` is null for the dashboard. */
async function openCheckout(user: User, plan: Plan, customer: string, slot: CheckoutSlot): Promise<{ url: string; sessionId: string | null }> {
  const dashboard = { url: `${siteUrl()}${DASHBOARD_URL}`, sessionId: null };

  // The webhook may not have landed yet (paid, closed the tab, came back): ask Stripe before opening another
  // Checkout. Read under the lease, so a Session the other tab just paid is seen here.
  const open = await stripe().subscriptions.list({ customer, limit: 10 });
  const current = open.data.find((s) => ACCESS_STATUSES.includes(s.status));
  if (current) {
    await syncSubscription(current.id);
    return dashboard;
  }

  // Reuse the open Session for this plan and expire the rest, leaving at most one payable Session per customer.
  const openSessions = await stripe().checkout.sessions.list({ customer, status: "open", limit: 10 });
  const reusable = openSessions.data.find((s) => s.metadata?.plan === plan && s.url);
  if (reusable?.url) return { url: reusable.url, sessionId: reusable.id };
  // A failed expiry is not success: the Session may have been paid in the meantime, or may still be payable. Each
  // one is confirmed closed, or the flow stops before creating a replacement.
  const closures = await Promise.all(openSessions.data.map((s) => closeCheckoutSession(s.id)));
  // The current generation's key already opened a Session (now closed, or for the other plan): a new key, or Stripe
  // would replay that Session. With nothing recorded and nothing closed, the key is reused on purpose: a holder whose
  // lease expired may still be creating under it, and sharing the key makes Stripe return its Session.
  if (closures.length > 0 || slot.sessionId) await advanceGeneration(user.id, slot);
  if (closures.includes("completed")) return dashboard;

  for (let attempt = 0; attempt < 3; attempt++) {
    // No plan in the key: one generation, one Session. A request for the other plan under the same key is refused by
    // Stripe (parameters differ) instead of opening a second payable Session; the retry then expires the first.
    const idempotencyKey = `checkout-${user.id}-g${slot.generation}`;
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
    // An old answer replayed for this key (a crash before `sessionId` was saved): use it only if still open.
    const replayed = session.created < Date.now() / 1000 - REPLAY_AGE_S;
    if (replayed && (await stripe().checkout.sessions.retrieve(session.id)).status !== "open") {
      await advanceGeneration(user.id, slot);
      continue;
    }
    return { url: session.url, sessionId: session.id };
  }
  throw new Error("Stripe kept replaying closed Checkout Sessions");
}

/**
 * Records the Session opened under the current generation and frees the lease. Returns false when the lease was
 * taken over meanwhile (nothing is written: the new holder saw, or shares the key of, this Session) or the write failed.
 */
async function releaseCheckoutSlot(userId: string, slot: CheckoutSlot, sessionId: string | null) {
  try {
    const released = await db
      .update(checkoutSlots)
      .set({ leaseToken: null, leasedAt: null, ...(sessionId ? { sessionId } : {}) })
      .where(heldBy(userId, slot.token))
      .returning({ userId: checkoutSlots.userId });
    return released.length > 0;
  } catch {
    return false; // an unreleased lease only delays the next attempt until it is stale
  }
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
