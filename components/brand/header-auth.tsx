import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import { Suspense } from "react";
import { CtaBadges } from "@/components/landing/cta-badges";
import { ArrowRightIcon } from "@/components/landing/icons";
import { DASHBOARD_URL, SIGN_IN_URL } from "@/lib/routes";

export function HeaderAuth() {
  return (
    <div className="flex items-center gap-4">
      <Suspense>
        <Show when="signed-out">
          <Link href={SIGN_IN_URL} className="text-[16px] font-semibold hover:opacity-70 md:hidden">
            Entrar
          </Link>
          <CtaBadges size="sm" className="hidden md:flex" />
        </Show>
        <Show when="signed-in">
          <Link
            href={DASHBOARD_URL}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-black px-5 text-[15px] font-semibold text-white transition-opacity hover:opacity-85"
          >
            Abrir painel <ArrowRightIcon className="size-4" />
          </Link>
          <UserButton />
        </Show>
      </Suspense>
    </div>
  );
}
