import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";
import { CHECKOUT_URL } from "@/lib/routes";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUp fallbackRedirectUrl={CHECKOUT_URL} signInFallbackRedirectUrl={CHECKOUT_URL} />
    </Suspense>
  );
}
