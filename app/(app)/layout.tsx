import { UserButton } from "@clerk/nextjs";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[linear-gradient(180deg,#ffffff_0px,#fffff6_600px,#f7fbf7_1400px)] text-[#111]">
      <header className="border-b border-[#ececec] bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-[1280px] items-center justify-between px-6">
          <Logo />
          <Suspense fallback={<span className="size-9 rounded-full bg-[#f3f4f6]" />}>
            <UserButton />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 pt-12 pb-24">{children}</main>
    </div>
  );
}
