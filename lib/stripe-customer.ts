import { stripe } from "./stripe-client";

// Kept free of Next/Clerk/server-only imports: used by the web app and by the Trigger.dev worker.

/**
 * Deletes a Stripe customer, which cancels its subscriptions immediately. A customer that is already gone
 * counts as done, so a retry after a partial failure does not get stuck.
 */
export async function deleteStripeCustomerById(customerId: string) {
  try {
    await stripe().customers.del(customerId);
  } catch (err) {
    if ((err as { code?: unknown }).code === "resource_missing") return;
    throw err;
  }
}
