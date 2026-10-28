import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { siteUrl } from "@/lib/env";
import { DASHBOARD_URL, SETTINGS_URL } from "@/lib/routes";
import { userHasAccess } from "@/lib/services/access";
import { syncSubscription } from "@/lib/services/billing";
import { ensureUser } from "@/lib/services/users";
import { stripe } from "@/lib/stripe";

// Where Stripe sends the customer after paying. The webhook usually lands a moment later, so the
// subscription is synced here first; otherwise the dashboard gate could bounce a user who just paid.
export async function GET(req: NextRequest) {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();

  const user = await ensureUser(userId);
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (sessionId?.startsWith("cs_")) {
    try {
      const session = await stripe().checkout.sessions.retrieve(sessionId);
      const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscription = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      // Only the session's own customer may sync it.
      if (subscription && customer && customer === user.stripeCustomerId) await syncSubscription(subscription);
    } catch (err) {
      Sentry.captureException(err, { tags: { route: "assinar_sucesso" } });
    }
  }

  // Not active yet (webhook still pending): Settings is not gated and tells the user it is being activated.
  const destination = (await userHasAccess(user.id)) ? DASHBOARD_URL : `${SETTINGS_URL}?checkout=success`;
  return NextResponse.redirect(`${siteUrl()}${destination}`);
}
