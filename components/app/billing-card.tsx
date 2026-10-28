"use client";

import { useTransition } from "react";
import { openBillingPortalAction, startCheckoutAction } from "@/app/(app)/actions";
import { ANNUAL_PRICE, MONTHLY_PRICE, TRIAL_DAYS } from "@/components/landing/pricing";
import type { Billing } from "@/lib/data/types";
import { formatDate } from "@/lib/format";
import { useToast } from "./toast";
import { Badge, Card, CardTitle, buttonPrimary, buttonSecondary } from "./ui";

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PLAN_NAME = { monthly: "Mensal", annual: "Anual" } as const;

export function BillingCard({ billing, timezone, checkout }: { billing: Billing; timezone: string; checkout?: string }) {
  const [toast, showToast] = useToast();
  const [pending, startTransition] = useTransition();
  const day = (iso: string) => formatDate(iso, timezone, { day: "2-digit", month: "long", year: "numeric" });

  function go(action: () => Promise<{ ok: true; data: { url: string } } | { ok: false; error: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) window.location.assign(result.data.url);
      else showToast(result.error);
    });
  }

  if (billing.hasAccess) {
    const trialing = billing.status === "trialing" && billing.trialEnd;
    return (
      <Card>
        <CardTitle
          title="Assinatura"
          subtitle={billing.plan ? `Plano ${PLAN_NAME[billing.plan]}` : "Iron AI"}
          action={
            billing.status === "past_due" ? (
              <Badge tone="warn">Pagamento pendente</Badge>
            ) : trialing ? (
              <Badge tone="good">Teste grátis</Badge>
            ) : (
              <Badge tone="good">● Ativa</Badge>
            )
          }
        />
        <p className="mt-4 text-[14px] text-[#3f3f46]">
          {billing.status === "past_due"
            ? "Não conseguimos cobrar seu cartão. Atualize a forma de pagamento para não perder o acesso."
            : billing.cancelAtPeriodEnd
              ? `Cancelada: você continua com acesso até ${day(billing.currentPeriodEnd!)}.`
              : trialing
                ? `Seu teste grátis termina em ${day(billing.trialEnd!)}. Depois disso a cobrança começa automaticamente.`
                : `Próxima cobrança em ${day(billing.currentPeriodEnd!)}.`}
        </p>
        <div className="mt-6">
          <button type="button" disabled={pending} onClick={() => go(openBillingPortalAction)} className={billing.status === "past_due" ? buttonPrimary : buttonSecondary}>
            Gerenciar assinatura
          </button>
        </div>
        {toast}
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle
        title="Assinatura"
        subtitle={
          billing.status
            ? "Sua assinatura terminou. Assine de novo para continuar usando o Iron AI."
            : `Teste ${TRIAL_DAYS} dias grátis com tudo liberado. Cancele quando quiser.`
        }
      />
      {checkout === "error" && (
        <p className="mt-4 rounded-[16px] bg-[#fff1f2] px-4 py-3 text-[14px] text-[#9f1239]">
          Não foi possível abrir o pagamento agora. Escolha um plano abaixo para tentar de novo.
        </p>
      )}
      {checkout === "success" && (
        <p className="mt-4 rounded-[16px] bg-[#f0fdf4] px-4 py-3 text-[14px] text-[#166534]">
          Pagamento recebido! Estamos ativando sua assinatura, atualize a página em alguns segundos.
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" disabled={pending} onClick={() => go(() => startCheckoutAction({ plan: "monthly" }))} className={buttonPrimary}>
          Mensal · {brl(MONTHLY_PRICE)}/mês
        </button>
        <button type="button" disabled={pending} onClick={() => go(() => startCheckoutAction({ plan: "annual" }))} className={buttonSecondary}>
          Anual · {brl(ANNUAL_PRICE)}/ano
        </button>
      </div>
      {toast}
    </Card>
  );
}
