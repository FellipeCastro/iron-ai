import type { Metadata } from "next";
import { UserButton } from "@clerk/nextjs";
import { Suspense } from "react";
import { AppNav, BottomNav } from "@/components/app/app-nav";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-[linear-gradient(180deg,#ffffff_0px,#fffff6_600px,#f7fbf7_1400px)] text-[#111]">
      <header className="sticky top-0 z-30 border-b border-[#ececec] bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-6 px-4 sm:h-20 sm:px-6">
          <Logo />
          <AppNav className="hidden lg:flex" />
          <Suspense fallback={<span className="size-9 rounded-full bg-[#f3f4f6]" />}>
            <UserButton />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-8 pb-28 sm:px-6 sm:pt-12 lg:pb-24">{children}</main>
      <BottomNav />
    </div>
  );
}
