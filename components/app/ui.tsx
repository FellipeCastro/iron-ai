import type { DayLetter } from "@/lib/data/types";

// Building blocks for the (app) pages, following the landing's visual language.

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <p className="text-[14px] font-medium tracking-[0.08em] text-[#f43f5e] uppercase">{eyebrow}</p>
        <h1 className="mt-3 text-[32px] leading-[42px] font-semibold tracking-[-0.01em] sm:text-[40px] sm:leading-[50px]">{title}</h1>
        {description && <p className="mt-2 max-w-[600px] text-[17px] text-[#5b5b66]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`rounded-[28px] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)] sm:p-8 ${className}`}>{children}</section>;
}

export function CardTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[20px] font-bold">{title}</h2>
        {subtitle && <p className="mt-1 text-[14px] text-[#5b5b66]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string;
  delta?: { text: string; good: boolean | null };
  hint?: string;
}) {
  const deltaColor = delta?.good === true ? "text-[#15803d] bg-[#ecfdf3]" : delta?.good === false ? "text-[#be123c] bg-[#fff1f3]" : "text-[#5b5b66] bg-[#f5f5f8]";
  return (
    <Card className="p-6!">
      <p className="text-[14px] font-medium text-[#5b5b66]">{label}</p>
      <p className="mt-2 text-[34px] leading-[40px] font-semibold tracking-[-0.01em]">{value}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
        {delta && <span className={`rounded-full px-2 py-0.5 font-semibold ${deltaColor}`}>{delta.text}</span>}
        {hint && <span className="text-[#8a8a94]">{hint}</span>}
      </div>
    </Card>
  );
}

const badgeTones = {
  neutral: "bg-[#f5f5f8] text-[#3f3f46]",
  dark: "bg-[#1e1a24] text-white",
  pr: "bg-[#fff7e0] text-[#92400e]",
  warn: "bg-[#fff1f3] text-[#be123c]",
  good: "bg-[#ecfdf3] text-[#15803d]",
  blue: "bg-[#e8f6fd] text-[#0b6fa4]",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof badgeTones; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

export function DayBadge({ letter, size = "md" }: { letter: DayLetter; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "size-8 rounded-[10px] text-[14px]", md: "size-11 rounded-xl text-[18px]", lg: "size-14 rounded-2xl text-[24px]" };
  return (
    <span className={`flex shrink-0 items-center justify-center bg-[#1e1a24] font-bold text-white ${sizes[size]}`} aria-label={`Treino ${letter}`}>
      {letter}
    </span>
  );
}

export const buttonPrimary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-black px-6 text-[15px] font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40";
export const buttonSecondary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-6 text-[15px] font-medium transition-colors hover:bg-[#f3f4f6] disabled:opacity-40";
export const buttonDanger =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#e11d48] px-6 text-[15px] font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40";
export const inputBase =
  "h-11 rounded-[12px] border border-[#e5e7eb] bg-white px-4 text-[15px] outline-none transition-colors focus:border-[#111]";
