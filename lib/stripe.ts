import "server-only";
import Stripe from "stripe";
import { requireEnv } from "./env";

// One client per server instance, created on first use so builds and tools do not need the key.
let client: Stripe | null = null;
export const stripe = () => (client ??= new Stripe(requireEnv("STRIPE_SECRET_KEY")));

export type Plan = "monthly" | "annual";

export const priceId = (plan: Plan) => requireEnv(plan === "monthly" ? "STRIPE_PRICE_MONTHLY" : "STRIPE_PRICE_ANNUAL");

/** The plan a Stripe price belongs to, or null for a price this app does not sell. */
export function planOf(price: string): Plan | null {
  if (price === process.env.STRIPE_PRICE_MONTHLY) return "monthly";
  if (price === process.env.STRIPE_PRICE_ANNUAL) return "annual";
  return null;
}
