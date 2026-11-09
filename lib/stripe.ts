import "server-only";
import Stripe from "stripe";
import { requireEnv } from "./env";

// One client per server instance, created on first use so builds and tools do not need the key.
let client: Stripe | null = null;
export const stripe = () => (client ??= new Stripe(requireEnv("STRIPE_SECRET_KEY")));

export type Plan = "monthly" | "annual";

// STRIPE_PRICE_ANNUAL is a *monthly* recurring price (12 installments) sold with a 12-month commitment,
// enforced in lib/services/billing.ts. Prices sold before (R$ 19,90/month, R$ 199/year paid upfront) stay in
// the *_LEGACY variables so existing subscribers keep showing their plan.
export const priceId = (plan: Plan) => requireEnv(plan === "monthly" ? "STRIPE_PRICE_MONTHLY" : "STRIPE_PRICE_ANNUAL");

/** The plan a Stripe price belongs to, or null for a price this app does not sell. */
export function planOf(price: string): Plan | null {
  const env = process.env;
  if (price === env.STRIPE_PRICE_MONTHLY || price === env.STRIPE_PRICE_MONTHLY_LEGACY) return "monthly";
  if (price === env.STRIPE_PRICE_ANNUAL || price === env.STRIPE_PRICE_ANNUAL_LEGACY) return "annual";
  return null;
}

/** Annual plan in 12 monthly installments: cancelling only takes effect at the end of the 12-month cycle. */
export const hasCommitment = (price: string) => price === process.env.STRIPE_PRICE_ANNUAL;
