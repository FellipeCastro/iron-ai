import * as Sentry from "@sentry/nextjs";
import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { db, stripeEvents } from "@/db";
import { requireEnv } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { enqueue } from "@/lib/trace";
import type { processStripeEvent, StripeEventWork } from "@/trigger/stripe-events";

// Public route: no session on Stripe deliveries, the signature (STRIPE_WEBHOOK_SECRET) is the only check.
// The handler verifies, claims the event id and enqueues; the work runs in Trigger.dev (trigger/stripe-events.ts),
// so Stripe gets a fast 200. Each event has effect once: the event id is the primary key of `stripe_events` and the
// task marks it `processedAt` when done. A redelivery of a processed event is acknowledged with no effect; one whose
// claim is unfinished (e.g. the enqueue never happened) is enqueued again, deduplicated by the run's idempotency key.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    // The signature covers the raw body, so it must be read as text, not parsed JSON, and checked before anything else.
    event = stripe().webhooks.constructEvent(await req.text(), signature, requireEnv("STRIPE_WEBHOOK_SECRET"));
  } catch (err) {
    // Bad signing secret or a forged request; with a bad secret, subscription sync stops silently.
    Sentry.logger.warn("Stripe webhook verification failed", { error_type: err instanceof Error ? err.name : typeof err });
    return new Response("Verification failed", { status: 400 });
  }

  const work = workOf(event);
  // A type this app does not act on: nothing to claim or run.
  if (!work) return new Response("OK", { status: 200 });

  const [claimed] = await db
    .insert(stripeEvents)
    .values({ eventId: event.id, type: event.type })
    .onConflictDoNothing({ target: stripeEvents.eventId })
    .returning({ eventId: stripeEvents.eventId });
  if (!claimed) {
    // A claim only proves the event was received, not that it was enqueued: the process can die between the insert and
    // the enqueue, or the enqueue can fail with an unknown outcome. Only a finished event is skipped; an unfinished one is enqueued again.
    // That is safe: the run's idempotency key reuses an in-flight run, and the task skips an already processed event.
    const existing = await db.query.stripeEvents.findFirst({ where: eq(stripeEvents.eventId, event.id), columns: { processedAt: true } });
    if (existing?.processedAt) {
      Sentry.logger.info("Stripe event already processed", { event_id: event.id, event_type: event.type });
      return new Response("OK", { status: 200 });
    }
    Sentry.logger.info("Stripe event received but unfinished, enqueueing again", { event_id: event.id, event_type: event.type });
  }

  try {
    await enqueue("stripe-event", async ({ metadata }) =>
      tasks.trigger<typeof processStripeEvent>(
        "stripe-event",
        { eventId: event.id, type: event.type, work },
        {
          // A second trigger for the same event (e.g. after a lost response) reuses the first run.
          idempotencyKey: await idempotencyKeys.create(`stripe-${event.id}`, { scope: "global" }),
          concurrencyKey: concurrencyKeyOf(work),
          tags: [`stripe_${event.type}`],
          metadata,
        },
      ),
    );
  } catch (err) {
    // The outcome is unknown (the run may exist if only the response was lost), so the claim is never deleted: that
    // could drop a `processedAt` the worker is about to set. Stripe retries on the 500, finds the claim unfinished and
    // enqueues again under the same idempotency key.
    Sentry.captureException(err, { tags: { stripe_event: event.type } });
    return new Response("Enqueue failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}

/**
 * What an event asks for, as ids. Subscription events reduce to "this subscription changed" (the task reads its
 * current state from Stripe); risk events (dispute, refund, early fraud warning) name the charge or warning.
 */
function workOf(event: Stripe.Event): StripeEventWork | null {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return { kind: "subscription", subscriptionId: event.data.object.id };
    case "checkout.session.completed": {
      const sub = event.data.object.subscription;
      const subscriptionId = typeof sub === "string" ? sub : sub?.id;
      return subscriptionId ? { kind: "subscription", subscriptionId } : null;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const sub = event.data.object.parent?.subscription_details?.subscription;
      const subscriptionId = typeof sub === "string" ? sub : sub?.id;
      return subscriptionId ? { kind: "subscription", subscriptionId } : null;
    }
    case "charge.dispute.created": {
      const dispute = event.data.object;
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
      return { kind: "dispute", chargeId, disputeId: dispute.id, reason: dispute.reason, amount: dispute.amount };
    }
    case "charge.refunded":
      return { kind: "refund", chargeId: event.data.object.id, fullAtEvent: event.data.object.refunded };
    case "radar.early_fraud_warning.created": {
      const warning = event.data.object;
      return { kind: "fraud_warning", warningId: warning.id, fraudType: warning.fraud_type, actionable: warning.actionable };
    }
    default:
      return null;
  }
}

function concurrencyKeyOf(work: StripeEventWork) {
  switch (work.kind) {
    case "subscription":
      return work.subscriptionId;
    case "dispute":
    case "refund":
      return work.chargeId;
    case "fraud_warning":
      return work.warningId;
  }
}
