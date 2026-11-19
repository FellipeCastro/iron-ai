import { createHash } from "node:crypto";
import * as Sentry from "@sentry/node";
import { concurrencyLimit, task } from "@trigger.dev/sdk";
import { and, eq, isNull } from "drizzle-orm";
import { db, stripeEvents } from "@/db/client";
import { stripe } from "@/lib/stripe-client";
import { cancelCustomerSubscriptions, syncSubscription } from "@/lib/subscription-sync";
import { log } from "./log";

/**
 * The work a Stripe event asks for, reduced to ids by the webhook (app/api/webhooks/stripe/route.ts). The event body
 * only says WHICH object changed: the task reads that object's current state back from Stripe, so retries and
 * out-of-order deliveries cannot apply a stale snapshot. Ids and enum values only, no personal data.
 */
export type StripeEventWork =
  | { kind: "subscription"; subscriptionId: string }
  | { kind: "dispute"; chargeId: string; disputeId: string; reason: string; amount: number }
  | { kind: "refund"; chargeId: string; fullAtEvent: boolean }
  | { kind: "fraud_warning"; warningId: string; fraudType: string; actionable: boolean };

export type StripeEventPayload = { eventId: string; type: string; work: StripeEventWork };

// Events about the same subscription or charge run one at a time (concurrencyKey set by the webhook).
export const stripeEventSync = concurrencyLimit({ name: "stripe-event", perKey: 1 });

export const processStripeEvent = task({
  id: "stripe-event",
  concurrency: stripeEventSync,
  // Stripe got its 200 when the event was enqueued and will not redeliver it, so retry harder than the default.
  retry: { maxAttempts: 8, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 60_000, randomize: true },
  run: async ({ eventId, type, work }: StripeEventPayload) => {
    // The run is already unique per event (idempotency key); this also covers a replay after that key expired.
    const claim = await db.query.stripeEvents.findFirst({ where: eq(stripeEvents.eventId, eventId), columns: { processedAt: true } });
    if (claim?.processedAt) {
      log.info("Stripe event already processed", { event_id: eventId, event_type: type });
      return { skipped: true };
    }

    await apply(eventId, type, work);

    await db.update(stripeEvents).set({ processedAt: new Date() }).where(eq(stripeEvents.eventId, eventId));
    return { skipped: false };
  },
  onFailure: async ({ payload }) => {
    // Retries exhausted: Stripe will not send this event again. Replay the run from the Trigger.dev dashboard.
    log.error("Stripe event failed for good", { event_id: payload.eventId, event_type: payload.type });
  },
});

async function apply(eventId: string, type: string, work: StripeEventWork) {
  switch (work.kind) {
    case "subscription":
      await syncSubscription(work.subscriptionId);
      return;
    case "dispute": {
      const charge = await stripe().charges.retrieve(work.chargeId);
      const cancelled = await cancelAfterRisk(charge, eventId);
      await alert("Stripe dispute opened", eventId, type, { dispute_id: work.disputeId, reason: work.reason, amount: work.amount, cancelled });
      return;
    }
    case "refund": {
      // Only the event that completed the refund carries refunded=true in its body; earlier partial-refund events
      // do not. Without this, a stale or reordered event for the same charge would cancel a replacement subscription.
      if (!work.fullAtEvent) return;
      // The body is a snapshot from when it was sent; also confirm with Stripe that the charge is fully refunded now.
      const charge = await stripe().charges.retrieve(work.chargeId);
      if (!charge.refunded) return;
      const cancelled = await cancelAfterRisk(charge, eventId);
      await alert("Stripe charge fully refunded", eventId, type, { charge_id: charge.id, cancelled });
      return;
    }
    case "fraud_warning":
      // Not actionable by code: refunding before it becomes a dispute is a business call, so just alert.
      await alert("Stripe early fraud warning", eventId, type, { warning_id: work.warningId, fraud_type: work.fraudType, actionable: work.actionable });
      return;
  }
}

async function cancelAfterRisk(charge: { customer: string | { id: string } | null }, eventId: string) {
  const customer = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
  return customer ? cancelCustomerSubscriptions(customer, eventId) : 0;
}

/**
 * Ids only, no personal data. A warning-level message is what makes Sentry notify the owner.
 * The run is retried until `processedAt` is saved, so `alertedAt` is set only after Sentry acknowledged the event
 * (flush). Every attempt sends under the same event id derived from the Stripe event id, which Sentry deduplicates: a
 * retry after the acknowledgment but before `alertedAt` is saved does not notify the owner twice.
 */
async function alert(message: string, eventId: string, type: string, extra: Record<string, unknown>) {
  const delivered = await db.query.stripeEvents.findFirst({ where: eq(stripeEvents.eventId, eventId), columns: { alertedAt: true } });
  if (delivered?.alertedAt) return;
  Sentry.captureEvent({
    event_id: createHash("sha256").update(`stripe-alert:${eventId}`).digest("hex").slice(0, 32),
    message,
    level: "warning",
    tags: { stripe_event: type },
    extra: { event_id: eventId, ...extra },
  });
  // A false flush means the event may not have left the process: throw so the run retries instead of marking it sent.
  if (!(await Sentry.flush(5000))) throw new Error(`Sentry did not acknowledge the alert for Stripe event ${eventId}`);
  await db
    .update(stripeEvents)
    .set({ alertedAt: new Date() })
    .where(and(eq(stripeEvents.eventId, eventId), isNull(stripeEvents.alertedAt)));
}
