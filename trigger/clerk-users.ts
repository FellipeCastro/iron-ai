import { concurrencyLimit, logger, task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";

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

    logger.info(row ? "User created" : "User already existed", { clerkId });
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

    logger.info("User synced", { clerkId });
    return { synced: true };
  },
});

export const clerkUserDeleted = task({
  id: "clerk-user-deleted",
  concurrency: clerkUserSync,
  run: async ({ clerkId }: ClerkUserPayload) => {
    // Hard delete; every user-owned table cascades from `users`.
    const deleted = await db.delete(users).where(eq(users.clerkId, clerkId)).returning({ id: users.id });

    logger.info(deleted.length ? "User deleted" : "User not found", { clerkId });
    return { deleted: deleted.length > 0 };
  },
});
