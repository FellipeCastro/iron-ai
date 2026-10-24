import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import type { NextRequest } from "next/server";
import type { clerkUserCreated, clerkUserDeleted, clerkUserUpdated } from "@/trigger/clerk-users";

// Public route: no session on Clerk deliveries, `verifyWebhook` (CLERK_WEBHOOK_SIGNING_SECRET) is the only check.
// The handler only enqueues; the DB work runs in Trigger.dev so Clerk gets a fast 200.
export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch (err) {
    console.error("Clerk webhook verification failed:", err);
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
      await tasks.trigger<typeof clerkUserCreated>("clerk-user-created", { clerkId }, options);
      break;
    case "user.updated":
      await tasks.trigger<typeof clerkUserUpdated>("clerk-user-updated", { clerkId }, options);
      break;
    case "user.deleted":
      await tasks.trigger<typeof clerkUserDeleted>("clerk-user-deleted", { clerkId }, options);
      break;
  }

  return new Response("OK", { status: 200 });
}
