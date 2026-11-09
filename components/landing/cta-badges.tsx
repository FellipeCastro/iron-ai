import Link from "next/link";
import { SIGN_IN_URL, SIGN_UP_URL } from "@/lib/routes";

export { SIGN_IN_URL, SIGN_UP_URL } from "@/lib/routes";

type BadgeSize = "sm" | "lg";

const sizes: Record<BadgeSize, string> = {
  sm: "h-10 px-5 text-[15px]",
  lg: "h-12 px-7 text-[17px]",
};

export function CtaBadges({ size = "lg", className = "" }: { size?: BadgeSize; className?: string }) {
  const box = `inline-flex items-center justify-center rounded-full font-semibold transition-opacity hover:opacity-85 ${sizes[size]}`;
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <Link href={SIGN_UP_URL} className={`${box} bg-black text-white`}>
        Assinar agora
      </Link>
      <Link href={SIGN_IN_URL} className={`${box} border border-[#d4d4d8] bg-white text-[#111]`}>
        Entrar
      </Link>
    </div>
  );
}
