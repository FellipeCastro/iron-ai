"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { APP_NAV } from "@/lib/routes";

function NavLinks({ pathname, className }: { pathname: string | null; className: string }) {
  return (
    <nav className={`flex items-center gap-1 ${className}`}>
      {APP_NAV.map((item) => {
        const active = !!pathname && (pathname === item.href || pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-[15px] font-medium whitespace-nowrap transition-colors ${
              active ? "bg-black text-white" : "text-[#3f3f46] hover:bg-[#f3f4f6]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ActiveNav({ className }: { className: string }) {
  return <NavLinks pathname={usePathname()} className={className} />;
}

// The pathname is request data, so the active pill streams in; the static links render immediately.
export function AppNav({ className = "" }: { className?: string }) {
  return (
    <Suspense fallback={<NavLinks pathname={null} className={className} />}>
      <ActiveNav className={className} />
    </Suspense>
  );
}
