"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { APP_NAV, DASHBOARD_URL, ROUTINE_URL, SETTINGS_URL } from "@/lib/routes";
import { HomeIcon, ListIcon, SlidersIcon } from "./icons";

const NAV_ICON = {
  [DASHBOARD_URL]: HomeIcon,
  [ROUTINE_URL]: ListIcon,
  [SETTINGS_URL]: SlidersIcon,
} as const;

const isActive = (pathname: string | null, match: readonly string[]) =>
  !!pathname && match.some((href) => pathname === href || pathname.startsWith(`${href}/`));

function NavLinks({ pathname, className }: { pathname: string | null; className: string }) {
  return (
    <nav className={`flex items-center gap-1 ${className}`}>
      {APP_NAV.map((item) => {
        const active = isActive(pathname, item.match);
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

function TabLinks({ pathname }: { pathname: string | null }) {
  return (
    <ul className="mx-auto grid max-w-[520px] grid-cols-3">
      {APP_NAV.map((item) => {
        const active = isActive(pathname, item.match);
        const Icon = NAV_ICON[item.href as keyof typeof NAV_ICON];
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                active ? "text-black" : "text-[#8a8a94] active:text-[#111]"
              }`}
            >
              <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? "bg-black text-white" : ""}`}>
                <Icon className="size-5" />
              </span>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ActiveTabs() {
  return <TabLinks pathname={usePathname()} />;
}

/** Thumb-reach tab bar for phones; the top nav takes over from `lg`. */
export function BottomNav() {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#ececec] bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <Suspense fallback={<TabLinks pathname={null} />}>
        <ActiveTabs />
      </Suspense>
    </nav>
  );
}
