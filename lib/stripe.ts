import "server-only";
import { requireEnv } from "./env";

// Web entry point for Stripe (server-only). The client itself lives in stripe-client.ts so the Trigger.dev worker can use it.
export { stripe } from "./stripe-client";

export type Plan = "monthly" | "annual";

export const priceId = (plan: Plan) => requireEnv(plan === "monthly" ? "STRIPE_PRICE_MONTHLY" : "STRIPE_PRICE_ANNUAL");

/** The plan a Stripe price belongs to, or null for a price this app does not sell. */
export function planOf(price: string): Plan | null {
  if (price === process.env.STRIPE_PRICE_MONTHLY) return "monthly";
  if (price === process.env.STRIPE_PRICE_ANNUAL) return "annual";
  return null;
}
