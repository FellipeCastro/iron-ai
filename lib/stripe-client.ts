import Stripe from "stripe";
import { requireEnv } from "./env";

// Stripe client without the `server-only` guard of lib/stripe.ts: the Trigger.dev worker (e.g. the Clerk
// `user.deleted` task) runs outside Next.js, where `server-only` throws. Web code should import lib/stripe.ts.

// One client per server instance, created on first use so builds and tools do not need the key.
let client: Stripe | null = null;
export const stripe = () => (client ??= new Stripe(requireEnv("STRIPE_SECRET_KEY")));

/**
 * Every item of a Stripe list, following `has_more` page by page. A decision made from the first page alone (which
 * subscription is the oldest, which Sessions are still open) would miss what sits on later pages.
 */
export async function listAll<T extends { id: string }>(
  page: (params: { limit: number; starting_after?: string }) => Promise<{ data: T[]; has_more?: boolean }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let startingAfter: string | undefined; ; ) {
    const res = await page({ limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
    all.push(...res.data);
    if (!res.has_more || res.data.length === 0) return all;
    startingAfter = res.data[res.data.length - 1].id;
  }
}
