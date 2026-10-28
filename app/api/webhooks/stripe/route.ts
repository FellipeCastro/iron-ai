import * as Sentry from "@sentry/nextjs";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { requireEnv } from "@/lib/env";
import { syncSubscription } from "@/lib/services/billing";
import { stripe } from "@/lib/stripe";

// Public route: no session on Stripe deliveries, the signature (STRIPE_WEBHOOK_SECRET) is the only check.
// Every handled event reduces to "this subscription changed": syncSubscription reads its current state from
// Stripe, so retries and out-of-order deliveries are harmless.
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
