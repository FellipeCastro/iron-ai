"use client";

import { useState, useTransition } from "react";
import { startCheckoutAction } from "@/app/(app)/actions";
import { ANNUAL_INSTALLMENT_PRICE, ANNUAL_INSTALLMENTS, ANNUAL_PRICE, ANNUAL_SAVINGS, brl, MONTHLY_PRICE } from "@/lib/plans";
import { useToast } from "./toast";
import { buttonPrimary } from "./ui";

type Plan = "monthly" | "annual";

function Radio({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-black bg-black" : "border-[#d4d4d8]"}`}>
      {on && <span className="size-2 rounded-full bg-white" />}
    </span>
  );
}

const option = (on: boolean) =>
  `relative flex cursor-pointer rounded-[28px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-shadow has-focus-visible:ring-2 has-focus-visible:ring-black ${
    on ? "outline-2 outline-black" : "outline-1 outline-[#e5e7eb] hover:outline-[#a1a1aa]"
  }`;

/** The annual plan is the featured choice; the monthly one sits below as the no-commitment alternative. */
export function PlanPicker({ initial }: { initial: Plan }) {
  const [selected, setSelected] = useState<Plan>(initial);
  const [toast, showToast] = useToast();
  const [pending, startTransition] = useTransition();
  const annual = selected === "annual";

  function continueToCheckout() {
    startTransition(async () => {
      const result = await startCheckoutAction({ plan: selected });
      if (result.ok) window.location.assign(result.data.url);
      else showToast(result.error);
    });
  }

  return (
    <div className="mx-auto max-w-[560px]">
      <fieldset className="flex flex-col gap-4">
        <legend className="sr-only">Plano</legend>

        <label className={`${option(annual)} flex-col px-7 pt-8 pb-7`}>
          <input type="radio" name="plan" value="annual" checked={annual} onChange={() => setSelected("annual")} className="sr-only" />
          <span className="absolute -top-3 left-7 rounded-full bg-[#f43f5e] px-3 py-0.5 text-[12px] font-semibold tracking-wide text-white uppercase">
            Melhor valor
          </span>
          <span className="flex items-center justify-between">
            <span className="text-[20px] font-bold">Plano anual</span>
            <Radio on={annual} />
          </span>
          <span className="mt-4 flex items-baseline gap-1.5">
            <span className="text-[48px] leading-none font-semibold tracking-[-0.02em]">{brl(ANNUAL_INSTALLMENT_PRICE)}</span>
            <span className="text-[16px] text-[#5b5b66]">/ mês</span>
          </span>
          <span className="mt-2 text-[14px] text-[#5b5b66]">
            {ANNUAL_INSTALLMENTS}x no cartão, total de {brl(ANNUAL_PRICE)}. Você economiza {brl(ANNUAL_SAVINGS)} e tem fidelidade de 12 meses.
          </span>
        </label>

        <label className={`${option(!annual)} items-center justify-between gap-4 px-7 py-5`}>
          <input type="radio" name="plan" value="monthly" checked={!annual} onChange={() => setSelected("monthly")} className="sr-only" />
          <span>
            <span className="block text-[16px] font-semibold">Mensal · {brl(MONTHLY_PRICE)}/mês</span>
            <span className="mt-0.5 block text-[14px] text-[#5b5b66]">Sem fidelidade. Cancele quando quiser.</span>
          </span>
          <Radio on={!annual} />
        </label>
      </fieldset>

      <div className="mt-8 flex flex-col items-center gap-3">
        <button type="button" disabled={pending} onClick={continueToCheckout} className={`${buttonPrimary} h-12! px-8! text-[17px]!`}>
          {pending ? "Abrindo pagamento…" : annual ? `Assinar por ${brl(ANNUAL_INSTALLMENT_PRICE)}/mês` : `Assinar por ${brl(MONTHLY_PRICE)}/mês`}
        </button>
        <p className="text-center text-[14px] text-[#5b5b66]">Pagamento seguro pela Stripe. Você pode pedir reembolso em até 7 dias.</p>
      </div>
      {toast}
    </div>
  );
}
