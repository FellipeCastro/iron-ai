"use client";

import { useRef, useState, useTransition } from "react";
import { startCheckoutAction } from "@/app/(app)/actions";
import { ANNUAL_PRICE, MONTHLY_PRICE } from "@/lib/pricing";
import { useToast } from "./toast";
import { buttonPrimary } from "./ui";

type Plan = "monthly" | "annual";

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const plans: { plan: Plan; name: string; price: string; period: string; note: string; badge?: string }[] = [
  { plan: "monthly", name: "Mensal", price: brl(MONTHLY_PRICE), period: "/ mês", note: "Sem fidelidade. Cancele quando quiser." },
  {
    plan: "annual",
    name: "Anual",
    price: brl(ANNUAL_PRICE),
    period: "/ ano",
    note: `Equivale a ${brl(ANNUAL_PRICE / 12)} por mês. Economize ${brl(MONTHLY_PRICE * 12 - ANNUAL_PRICE)}.`,
    badge: "Melhor valor",
  },
];

/** Pick monthly or annual, then continue to Stripe Checkout (the first charge happens there). */
export function PlanPicker({ initial }: { initial: Plan }) {
  const [selected, setSelected] = useState<Plan>(initial);
  const [toast, showToast] = useToast();
  const [pending, startTransition] = useTransition();
  // Idempotency-Key of the current checkout attempt: one UUID v4 per plan choice, resent on every retry (double
  // click, retry after an error), so the server opens Checkout once and answers every repeat the same way.
  const attempt = useRef<{ plan: Plan; key: string } | null>(null);

  function continueToCheckout() {
    if (attempt.current?.plan !== selected) attempt.current = { plan: selected, key: crypto.randomUUID() };
    const { key } = attempt.current;
    startTransition(async () => {
      const result = await startCheckoutAction({ plan: selected, idempotencyKey: key });
      if (result.ok) window.location.assign(result.data.url);
      else showToast(result.error);
    });
  }

  return (
    <div>
      <fieldset>
        <legend className="sr-only">Plano</legend>
        <div className="grid gap-5 md:grid-cols-2">
          {plans.map((p) => {
            const on = selected === p.plan;
            return (
              <label
                key={p.plan}
                className={`relative flex cursor-pointer flex-col rounded-[28px] bg-white px-7 pt-8 pb-7 shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-shadow has-focus-visible:ring-2 has-focus-visible:ring-black ${
                  on ? "outline-2 outline-black" : "outline-1 outline-[#e5e7eb] hover:outline-[#a1a1aa]"
                }`}
              >
                <input
                  type="radio"
                  name="plan"
                  value={p.plan}
                  checked={on}
                  onChange={() => setSelected(p.plan)}
                  className="sr-only"
                />
                {p.badge && (
                  <span className="absolute -top-3 left-7 rounded-full bg-[#f43f5e] px-3 py-0.5 text-[12px] font-semibold tracking-wide text-white uppercase">
                    {p.badge}
                  </span>
                )}
                <span className="flex items-center justify-between">
                  <span className="text-[20px] font-bold">{p.name}</span>
                  <span
                    aria-hidden
                    className={`flex size-6 items-center justify-center rounded-full border-2 ${on ? "border-black bg-black" : "border-[#d4d4d8]"}`}
                  >
                    {on && <span className="size-2 rounded-full bg-white" />}
                  </span>
                </span>
                <span className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-[40px] leading-none font-semibold tracking-[-0.02em]">{p.price}</span>
                  <span className="text-[16px] text-[#5b5b66]">{p.period}</span>
                </span>
                <span className="mt-2 text-[14px] text-[#5b5b66]">{p.note}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-8 flex flex-col items-center gap-3">
        <button type="button" disabled={pending} onClick={continueToCheckout} className={`${buttonPrimary} h-12! px-8! text-[17px]!`}>
          {pending ? "Abrindo pagamento…" : "Assinar agora"}
        </button>
        <p className="text-center text-[14px] text-[#5b5b66]">
          Cobrança imediata no cartão. Você pode cancelar a qualquer momento.
        </p>
      </div>
      {toast}
    </div>
  );
}
