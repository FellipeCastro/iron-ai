import Image from "next/image";
import Link from "next/link";

export function Logo({ className = "", variant = "black" }: { className?: string; variant?: "black" | "white" }) {
  return (
    <Link href="/" className={`flex items-center gap-[3px] ${className}`} aria-label="Iron AI">
      <Image src={`/assets/logo-icon-${variant}.png`} alt="" width={337} height={325} className="h-[30px] w-auto" />
      <Image src={`/assets/logo-text-${variant}.png`} alt="Iron AI" width={448} height={124} className="h-[23px] w-auto" />
    </Link>
  );
}
