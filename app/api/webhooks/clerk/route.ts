import { verifyWebhook } from "@clerk/nextjs/webhooks";
import * as Sentry from "@sentry/nextjs";
import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import type { NextRequest } from "next/server";
import { enqueue } from "@/lib/trace";
import type { clerkUserCreated, clerkUserDeleted, clerkUserUpdated } from "@/trigger/clerk-users";

// Public route: no session on Clerk deliveries, `verifyWebhook` (CLERK_WEBHOOK_SIGNING_SECRET) is the only check.
// The handler only enqueues; the DB work runs in Trigger.dev so Clerk gets a fast 200.
export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch (err) {
    // Bad signing secret or a forged request; with a bad secret, user sync stops silently.
    Sentry.logger.warn("Clerk webhook verification failed", { error_type: err instanceof Error ? err.name : typeof err });
    return new Response("Verification failed", { status: 400 });
  }

  const clerkId = evt.data.id;
  if (!clerkId) return new Response("OK", { status: 200 });

  // Clerk (Svix) retries reuse the same `svix-id`, so a redelivered event never triggers a second run.
  const svixId = req.headers.get("svix-id") ?? `${evt.type}-${clerkId}`;
  const options = {
    idempotencyKey: await idempotencyKeys.create(svixId, { scope: "global" }),
    concurrencyKey: clerkId,
    tags: [`clerk_${clerkId}`],
  };

  switch (evt.type) {
    case "user.created":
      await enqueue("clerk-user-created", ({ metadata }) =>
        tasks.trigger<typeof clerkUserCreated>("clerk-user-created", { clerkId }, { ...options, metadata }),
      );
      break;
    case "user.updated":
      await enqueue("clerk-user-updated", ({ metadata }) =>
        tasks.trigger<typeof clerkUserUpdated>("clerk-user-updated", { clerkId }, { ...options, metadata }),
      );
      break;
    case "user.deleted":
      await enqueue("clerk-user-deleted", ({ metadata }) =>
        tasks.trigger<typeof clerkUserDeleted>("clerk-user-deleted", { clerkId }, { ...options, metadata }),
      );
      break;
  }

  return new Response("OK", { status: 200 });
}
