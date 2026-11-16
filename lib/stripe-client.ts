import Stripe from "stripe";
import { requireEnv } from "./env";

// Stripe client without the `server-only` guard of lib/stripe.ts: the Trigger.dev worker (e.g. the Clerk
// `user.deleted` task) runs outside Next.js, where `server-only` throws. Web code should import lib/stripe.ts.

// One client per server instance, created on first use so builds and tools do not need the key.
let client: Stripe | null = null;
export const stripe = () => (client ??= new Stripe(requireEnv("STRIPE_SECRET_KEY")));
