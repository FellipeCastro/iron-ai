import Link from "next/link";
import { MonitorIcon, TelegramColorIcon } from "./icons";

export const SIGN_UP_URL = "/sign-up";
export const SIGN_IN_URL = "/sign-in";

type BadgeSize = "sm" | "lg";

const sizes: Record<BadgeSize, { box: string; icon: string; small: string; big: string }> = {
  sm: { box: "h-10 gap-2 rounded-[7px] px-3", icon: "size-6", small: "text-[9px]", big: "text-[17px]" },
  lg: { box: "h-12 gap-2.5 rounded-[7px] px-4", icon: "size-7", small: "text-[11px]", big: "text-[21px]" },
};

function Badge({
  href,
  icon,
  small,
  big,
  size,
}: {
  href: string;
  icon: React.ReactNode;
  small: string;
  big: string;
  size: BadgeSize;
}) {
  const s = sizes[size];
  return (
    <Link
      href={href}
      className={`inline-flex items-center border border-[#a6a6a6] bg-black text-white transition-opacity hover:opacity-85 ${s.box}`}
    >
      <span className={`shrink-0 ${s.icon}`}>{icon}</span>
      <span className="flex flex-col leading-none">
        <span className={`${s.small} font-medium tracking-wide`}>{small}</span>
        <span className={`${s.big} font-semibold tracking-tight`}>{big}</span>
      </span>
    </Link>
  );
}

export function CtaBadges({ size = "lg", className = "" }: { size?: BadgeSize; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-4 ${className}`}>
      <Badge
        href={SIGN_UP_URL}
        size={size}
        icon={<TelegramColorIcon className="size-full" />}
        small="Converse pelo"
        big="Telegram"
      />
      <Badge
        href={SIGN_IN_URL}
        size={size}
        icon={<MonitorIcon className="size-full p-0.5" />}
        small="Acesse o"
        big="Painel web"
      />
    </div>
  );
}
