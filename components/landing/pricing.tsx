import Link from "next/link";
import { signUpForPlan } from "@/lib/routes";

export const TRIAL_DAYS = 14;
export const MONTHLY_PRICE = 19.9;
export const ANNUAL_PRICE = 199;

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const features = [
  "Registro de séries por texto livre no Telegram",
  "Metas e progressão automática de 8 a 12 reps",
  "Lembretes nos seus dias e horários de treino",
  "Resumo ao final de cada treino",
  "Gráficos de evolução, 1RM estimado e calorias",
  "Painel web com rotina e histórico completo",
];

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

type PlanProps = {
  plan: "monthly" | "annual";
  name: string;
  price: string;
  period: string;
  note: string;
  highlight?: boolean;
};

function Plan({ plan, name, price, period, note, highlight = false }: PlanProps) {
  const tone = highlight ? "bg-[#1e1a24] text-white shadow-[0_20px_50px_rgba(0,0,0,0.28)]" : "bg-white text-[#111] shadow-[0_8px_30px_rgba(0,0,0,0.06)]";
  const muted = highlight ? "text-[#d4d4d8]" : "text-[#5b5b66]";
  return (
    <article className={`relative flex flex-col rounded-[28px] px-8 pt-9 pb-8 ${tone}`}>
      {highlight && (
        <span className="absolute -top-3.5 left-8 rounded-full bg-[#f43f5e] px-3.5 py-1 text-[12px] font-semibold tracking-wide text-white uppercase">
          Melhor valor
        </span>
      )}
      <h3 className="text-[20px] font-bold">{name}</h3>
      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="text-[48px] leading-none font-semibold tracking-[-0.02em]">{price}</span>
        <span className={`text-[16px] ${muted}`}>{period}</span>
      </p>
      <p className={`mt-2 min-h-6 text-[14px] ${muted}`}>{note}</p>
      <Link
        href={signUpForPlan(plan)}
        className={`mt-7 inline-flex h-12 items-center justify-center rounded-full text-[17px] font-semibold transition-opacity hover:opacity-85 ${
          highlight ? "bg-white text-[#111]" : "bg-black text-white"
        }`}
      >
        Testar {TRIAL_DAYS} dias grátis
      </Link>
      <ul className="mt-8 flex flex-col gap-3.5">
        {features.map((feature) => (
          <li key={feature} className={`flex items-start gap-3 text-[15px] leading-5 ${highlight ? "text-white" : "text-[#3f3f46]"}`}>
            <CheckIcon className={`mt-0.5 size-5 shrink-0 ${highlight ? "text-[#4ade80]" : "text-[#16a34a]"}`} />
            {feature}
          </li>
        ))}
      </ul>
    </article>
  );
}

export function Pricing() {
  const perMonth = ANNUAL_PRICE / 12;
  const savings = MONTHLY_PRICE * 12 - ANNUAL_PRICE;
  return (
    <section id="precos" className="mx-auto max-w-[1440px] scroll-mt-20 px-6 pt-[160px] pb-[140px]">
      <h2 className="text-center text-[32px] leading-tight font-semibold tracking-[-0.01em] sm:text-[44px] lg:text-[48px]">
        Dois planos, os mesmos recursos
      </h2>
      <p className="mt-2 text-center text-[18px] text-[#333]">
        Teste {TRIAL_DAYS} dias grátis com tudo liberado. Depois, escolha o plano que cabe no seu treino.
      </p>
      <div className="mx-auto mt-[72px] grid max-w-[880px] gap-8 md:grid-cols-2">
        <Plan plan="monthly" name="Mensal" price={brl(MONTHLY_PRICE)} period="/ mês" note="Sem fidelidade. Cancele quando quiser." />
        <Plan
          plan="annual"
          name="Anual"
          price={brl(ANNUAL_PRICE)}
          period="/ ano"
          note={`Equivale a ${brl(perMonth)} por mês. Economize ${brl(savings)}.`}
          highlight
        />
      </div>
      <p className="mt-8 text-center text-[14px] text-[#5b5b66]">Cancele quando quiser, sem fidelidade em nenhum dos planos.</p>
    </section>
  );
}
