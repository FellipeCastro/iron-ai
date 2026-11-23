import { eq } from "drizzle-orm";
import { db, users } from "@/db/client";
import { deleteStripeCustomerById } from "@/lib/stripe-customer";

// Kept free of Next/Clerk/server-only imports: used by the account deletion action and by the Trigger.dev
// worker (clerk-user-deleted).

/** Stripe refused to delete the customer: nothing was deleted, so the caller can retry. */
export class BillingDeletionError extends Error {
  constructor(cause: unknown) {
    super(`Could not delete the Stripe customer: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
}

export type AccountToDelete = { id: string; stripeCustomerId: string | null };

/**
 * Deletes the user's billing and data. Billing first: deleting the Stripe customer cancels its subscriptions, so
 * nobody keeps being charged for an account that no longer exists; if Stripe fails, the user row (and the customer
 * id needed for the retry) is still there. Then the hard delete: every user-owned table cascades from `users`.
 * Idempotent: a customer that is already gone counts as done, and deleting a missing row is a no-op.
 * The Clerk login is not touched here (the action removes it; the Clerk webhook means it is already gone).
 */
export async function deleteAccount(user: AccountToDelete) {
  if (user.stripeCustomerId) {
    try {
      await deleteStripeCustomerById(user.stripeCustomerId);
    } catch (err) {
      throw new BillingDeletionError(err);
    }
  }
  await db.delete(users).where(eq(users.id, user.id));
}
