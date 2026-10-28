import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";
import { CHECKOUT_URL } from "@/lib/routes";

export const metadata: Metadata = { title: "Entrar" };

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn fallbackRedirectUrl={CHECKOUT_URL} signUpFallbackRedirectUrl={CHECKOUT_URL} />
    </Suspense>
  );
}
