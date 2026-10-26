import { clerkMiddleware } from "@clerk/nextjs/server";
import { SIGN_IN_URL, SIGN_UP_URL } from "@/lib/routes";

// Only exposes the session to the app; each page/route handler protects itself with `auth.protect()`.
export default clerkMiddleware({ signInUrl: SIGN_IN_URL, signUpUrl: SIGN_UP_URL });

export const config = {
  matcher: [
    "/__clerk/(.*)", // garante que o proxy do Clerk pegue também os .js
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
