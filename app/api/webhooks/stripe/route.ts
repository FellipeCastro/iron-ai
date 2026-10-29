import * as Sentry from "@sentry/nextjs";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { requireEnv } from "@/lib/env";
import { cancelCustomerSubscriptions, syncSubscription } from "@/lib/services/billing";
import { stripe } from "@/lib/stripe";

// Public route: no session on Stripe deliveries, the signature (STRIPE_WEBHOOK_SECRET) is the only check.
// Subscription events reduce to "this subscription changed": syncSubscription reads its current state from
// Stripe, so retries and out-of-order deliveries are harmless. Risk events (dispute, full refund, early fraud
// warning) alert us through Sentry; disputes and full refunds also cancel the subscription so nothing more is billed.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event;
  try {
    // The signature covers the raw body, so it must be read as text, not parsed JSON.
    event = stripe().webhooks.constructEvent(await req.text(), signature, requireEnv("STRIPE_WEBHOOK_SECRET"));
  } catch (err) {
    // Bad signing secret or a forged request; with a bad secret, subscription sync stops silently.
    Sentry.logger.warn("Stripe webhook verification failed", { error_type: err instanceof Error ? err.name : typeof err });
    return new Response("Verification failed", { status: 400 });
  }

  try {
    const subscriptionId = subscriptionIdOf(event);
    if (subscriptionId) await syncSubscription(subscriptionId);
    else await handleRiskEvent(event);
  } catch (err) {
    // A non-2xx makes Stripe retry with backoff.
    Sentry.captureException(err, { tags: { stripe_event: event.type } });
    return new Response("Handler failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}

function subscriptionIdOf(event: Stripe.Event) {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return event.data.object.id;
    case "checkout.session.completed": {
      const sub = event.data.object.subscription;
      return typeof sub === "string" ? sub : (sub?.id ?? null);
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const sub = event.data.object.parent?.subscription_details?.subscription;
      return typeof sub === "string" ? sub : (sub?.id ?? null);
    }
    default:
      return null;
  }
}

async function handleRiskEvent(event: Stripe.Event) {
  switch (event.type) {
    case "charge.dispute.created": {
      const dispute = event.data.object;
      const charge = await stripe().charges.retrieve(typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id);
      const cancelled = await cancelAfterRisk(charge);
      alert("Stripe dispute opened", event, { dispute_id: dispute.id, reason: dispute.reason, amount: dispute.amount, cancelled });
      return;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      // Partial refunds are goodwill; only a full refund ends the subscription.
      if (!charge.refunded) return;
      const cancelled = await cancelAfterRisk(charge);
      alert("Stripe charge fully refunded", event, { charge_id: charge.id, cancelled });
      return;
    }
    case "radar.early_fraud_warning.created": {
      const warning = event.data.object;
      // Not actionable by code: refunding before it becomes a dispute is a business call, so just alert.
      alert("Stripe early fraud warning", event, { warning_id: warning.id, fraud_type: warning.fraud_type, actionable: warning.actionable });
      return;
    }
    default:
      return;
  }
}

async function cancelAfterRisk(charge: Stripe.Charge) {
  const customer = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
  return customer ? cancelCustomerSubscriptions(customer) : 0;
}

/** Ids only, no personal data. A warning-level message is what makes Sentry notify the owner. */
function alert(message: string, event: Stripe.Event, extra: Record<string, unknown>) {
  Sentry.captureMessage(message, { level: "warning", tags: { stripe_event: event.type }, extra: { event_id: event.id, ...extra } });
}
