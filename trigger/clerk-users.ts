import { concurrencyLimit, task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { db, users } from "@/db/client";
import { deleteAccount } from "@/lib/services/account";
import { log } from "./log";

export type ClerkUserPayload = { clerkId: string };

// Runs for the same Clerk user execute one at a time (concurrencyKey = clerkId), so a
// created/updated/deleted burst for one user is applied in the order it was triggered.
export const clerkUserSync = concurrencyLimit({ name: "clerk-user-sync", perKey: 1 });

export const clerkUserCreated = task({
  id: "clerk-user-created",
  concurrency: clerkUserSync,
  run: async ({ clerkId }: ClerkUserPayload) => {
    // Clerk retries deliveries, so the insert must be a no-op when the row already exists.
    const [row] = await db
      .insert(users)
      .values({ clerkId })
      .onConflictDoNothing({ target: users.clerkId })
      .returning({ id: users.id });

    log.info(row ? "User created" : "User already existed", { clerk_id: clerkId, user_id: row?.id });
    return { created: Boolean(row) };
  },
});

export const clerkUserUpdated = task({
  id: "clerk-user-updated",
  concurrency: clerkUserSync,
  run: async ({ clerkId }: ClerkUserPayload) => {
    // Upsert: if `user.created` was missed (endpoint added later, delivery failed), this backfills the row.
    // Profile data (name, email) stays in Clerk; only `updated_at` tracks the sync for now.
    await db
      .insert(users)
      .values({ clerkId })
      .onConflictDoUpdate({ target: users.clerkId, set: { updatedAt: new Date() } });

    log.info("User synced", { clerk_id: clerkId });
    return { synced: true };
  },
});

export const clerkUserDeleted = task({
  id: "clerk-user-deleted",
  concurrency: clerkUserSync,
  run: async ({ clerkId }: ClerkUserPayload) => {
    const user = await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) });
    if (!user) {
      log.info("User not found", { clerk_id: clerkId });
      return { deleted: false };
    }

    // Same deletion as the app's (Stripe customer, then the user row). If Stripe fails the run throws and
    // Trigger.dev retries, with the user still in the database (the customer id is needed on the retry).
    await deleteAccount(user);

    log.info("User deleted", { clerk_id: clerkId, user_id: user.id, stripe_customer_deleted: Boolean(user.stripeCustomerId) });
    return { deleted: true };
  },
});
