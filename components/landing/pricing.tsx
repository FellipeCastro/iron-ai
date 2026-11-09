import Link from "next/link";
import { signUpForPlan } from "@/lib/routes";

import { ANNUAL_INSTALLMENT_PRICE, ANNUAL_INSTALLMENTS, ANNUAL_PRICE, ANNUAL_SAVINGS, brl, MONTHLY_PRICE } from "@/lib/plans";

export * from "@/lib/plans";

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

// One featured plan: the annual in 12 monthly installments. The monthly plan stays as a quieter alternative below it.
export function Pricing() {
  return (
    <section id="precos" className="mx-auto max-w-[1440px] scroll-mt-20 px-6 pt-[160px] pb-[140px]">
      <h2 className="text-center text-[32px] leading-tight font-semibold tracking-[-0.01em] sm:text-[44px] lg:text-[48px]">
        Tudo incluso por {brl(ANNUAL_INSTALLMENT_PRICE)} por mês
      </h2>
      <p className="mt-2 text-center text-[18px] text-[#333]">Todos os recursos liberados, no Telegram e no painel web.</p>

      <article className="relative mx-auto mt-[72px] flex max-w-[520px] flex-col rounded-[28px] bg-[#1e1a24] px-8 pt-10 pb-9 text-white shadow-[0_20px_50px_rgba(0,0,0,0.28)] sm:px-10">
        <span className="absolute -top-3.5 left-8 rounded-full bg-[#f43f5e] px-3.5 py-1 text-[12px] font-semibold tracking-wide text-white uppercase sm:left-10">
          Melhor valor
        </span>
        <h3 className="text-[20px] font-bold">Plano anual</h3>
        <p className="mt-5 flex items-baseline gap-1.5">
          <span className="text-[56px] leading-none font-semibold tracking-[-0.02em]">{brl(ANNUAL_INSTALLMENT_PRICE)}</span>
          <span className="text-[17px] text-[#d4d4d8]">/ mês</span>
        </p>
        <p className="mt-3 text-[14px] text-[#d4d4d8]">
          {ANNUAL_INSTALLMENTS}x no cartão, sem comprometer o limite do ano. Total de {brl(ANNUAL_PRICE)}, {brl(ANNUAL_SAVINGS)} a menos que
          no mensal.
        </p>
        <Link
          href={signUpForPlan("annual")}
          className="mt-8 inline-flex h-13 items-center justify-center rounded-full bg-white text-[17px] font-semibold text-[#111] transition-opacity hover:opacity-85"
        >
          Assinar por {brl(ANNUAL_INSTALLMENT_PRICE)}/mês
        </Link>
        <ul className="mt-8 flex flex-col gap-3.5">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-3 text-[15px] leading-5 text-white">
              <CheckIcon className="mt-0.5 size-5 shrink-0 text-[#4ade80]" />
              {feature}
            </li>
          ))}
        </ul>
        <p className="mt-8 text-[13px] text-[#a1a1aa]">Fidelidade de 12 meses. Renova por mais 12 se você não cancelar a renovação.</p>
      </article>

      <p className="mx-auto mt-8 max-w-[520px] text-center text-[15px] text-[#3f3f46]">
        Prefere sem fidelidade?{" "}
        <Link href={signUpForPlan("monthly")} className="font-semibold text-[#111] underline underline-offset-4 hover:opacity-70">
          Assine o mensal por {brl(MONTHLY_PRICE)}/mês
        </Link>
        , com os mesmos recursos e cancelamento quando quiser.
      </p>
    </section>
  );
}
