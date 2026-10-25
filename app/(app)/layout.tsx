import { UserButton } from "@clerk/nextjs";
import { Suspense } from "react";
import { AppNav } from "@/components/app/app-nav";
import { Logo } from "@/components/brand/logo";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[linear-gradient(180deg,#ffffff_0px,#fffff6_600px,#f7fbf7_1400px)] text-[#111]">
      <header className="sticky top-0 z-30 border-b border-[#ececec] bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-[1280px] items-center justify-between gap-6 px-6">
          <Logo />
          <AppNav className="hidden lg:flex" />
          <Suspense fallback={<span className="size-9 rounded-full bg-[#f3f4f6]" />}>
            <UserButton />
          </Suspense>
        </div>
        <AppNav className="mx-auto max-w-[1280px] overflow-x-auto px-4 pb-3 lg:hidden" />
      </header>
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-10 pb-24 sm:px-6 sm:pt-12">{children}</main>
    </div>
  );
}
