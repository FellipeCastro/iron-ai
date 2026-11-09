import type { Metadata } from "next";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PlanPicker } from "@/components/app/plan-picker";
import { Logo } from "@/components/brand/logo";
import { ANNUAL_INSTALLMENT_PRICE, brl } from "@/lib/plans";
import { DASHBOARD_URL } from "@/lib/routes";
import { userHasAccess } from "@/lib/services/access";
import { ensureUser } from "@/lib/services/users";

export const metadata: Metadata = { title: "Escolha seu plano", robots: { index: false, follow: false } };

// Where sign-in/sign-up land and where the dashboard sends users without a subscription. Users who already
// have access skip it; everyone else picks a plan and continues to Stripe Checkout.
export default function SubscribePage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[linear-gradient(180deg,#ffffff_0px,#fffff6_600px,#f7fbf7_1400px)] text-[#111]">
      <header className="mx-auto flex h-20 w-full max-w-[1280px] items-center justify-between px-6">
        <Logo />
        <Suspense fallback={<span className="size-9 rounded-full bg-[#f3f4f6]" />}>
          <UserButton />
        </Suspense>
      </header>
      <main className="mx-auto w-full max-w-[880px] flex-1 px-6 pt-8 pb-20 sm:pt-14">
        <h1 className="text-center text-[32px] leading-tight font-semibold tracking-[-0.01em] sm:text-[44px]">Escolha seu plano</h1>
        <p className="mt-3 mb-12 text-center text-[18px] text-[#333]">Todos os recursos liberados por {brl(ANNUAL_INSTALLMENT_PRICE)} por mês.</p>
        <Suspense>
          <Plans searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function Plans({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
  const user = await ensureUser(userId);
  if (await userHasAccess(user.id)) redirect(DASHBOARD_URL);

  // The pricing cards on the landing page preselect the plan the visitor clicked.
  const { plan } = await searchParams;

  return <PlanPicker initial={plan === "monthly" ? "monthly" : "annual"} />;
}
