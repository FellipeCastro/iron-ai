"use client";

import { useState, useTransition } from "react";
import { openBillingPortalAction, setRenewalAction, startCheckoutAction } from "@/app/(app)/actions";
import type { Billing } from "@/lib/data/types";
import { formatDate } from "@/lib/format";
import { ANNUAL_INSTALLMENT_PRICE, ANNUAL_INSTALLMENTS, brl, MONTHLY_PRICE } from "@/lib/plans";
import { useToast } from "./toast";
import { Badge, Card, CardTitle, buttonDanger, buttonPrimary, buttonSecondary } from "./ui";

const PLAN_NAME = { monthly: "Mensal", annual: "Anual" } as const;

export function BillingCard({ billing, timezone, checkout }: { billing: Billing; timezone: string; checkout?: string }) {
  const [toast, showToast] = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const day = (iso: string) => formatDate(iso, timezone, { day: "2-digit", month: "long", year: "numeric" });

  function setRenewal(renew: boolean) {
    startTransition(async () => {
      const result = await setRenewalAction({ renew });
      if (!result.ok) return showToast(result.error);
      setConfirmingCancel(false);
      showToast(renew ? "Pronto, sua assinatura continua renovando." : "Renovação cancelada.");
    });
  }

  function go(action: () => Promise<{ ok: true; data: { url: string } } | { ok: false; error: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) window.location.assign(result.data.url);
      else showToast(result.error);
    });
  }

  if (billing.complimentary && !billing.status) {
    return (
      <Card>
        <CardTitle title="Assinatura" subtitle="Iron AI" action={<Badge tone="good">Acesso gratuito</Badge>} />
        <p className="mt-4 text-[14px] text-[#3f3f46]">Sua conta foi criada antes das assinaturas e continua com acesso completo, sem cobrança.</p>
      </Card>
    );
  }

  if (billing.hasAccess) {
    const trialing = billing.status === "trialing" && billing.trialEnd;
    const pastDue = billing.status === "past_due";
    // Annual plan in installments: cancelling only stops the renewal at the end of the 12-month cycle.
    const commitmentEnd = billing.commitmentEnd;
    const endsAt = billing.cancelAt;
    let message: string;
    if (pastDue) message = "Não conseguimos cobrar seu cartão. Atualize a forma de pagamento para não perder o acesso.";
    else if (endsAt && commitmentEnd && !trialing)
      message = `Renovação cancelada: as parcelas restantes continuam e seu acesso vai até ${day(endsAt)}.`;
    else if (endsAt) message = `Cancelada: você continua com acesso até ${day(endsAt)}.`;
    else if (trialing && commitmentEnd)
      message = `Seu teste grátis termina em ${day(billing.trialEnd!)}. Depois disso começam as ${ANNUAL_INSTALLMENTS} parcelas mensais de ${brl(ANNUAL_INSTALLMENT_PRICE)}.`;
    else if (trialing) message = `Seu teste grátis termina em ${day(billing.trialEnd!)}. Depois disso a cobrança começa automaticamente.`;
    else if (commitmentEnd)
      message = `Próxima parcela em ${day(billing.currentPeriodEnd!)}. Fidelidade até ${day(commitmentEnd)}; depois o plano renova por mais 12 meses.`;
    else message = `Próxima cobrança em ${day(billing.currentPeriodEnd!)}.`;

    return (
      <Card>
        <CardTitle
          title="Assinatura"
          subtitle={billing.plan ? `Plano ${PLAN_NAME[billing.plan]}${commitmentEnd ? ` (${ANNUAL_INSTALLMENTS}x)` : ""}` : "Iron AI"}
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
        <p className="mt-4 text-[14px] text-[#3f3f46]">{message}</p>
        {confirmingCancel && commitmentEnd && (
          <p className="mt-4 rounded-[16px] bg-[#fff1f2] px-4 py-3 text-[14px] text-[#9f1239]">
            {trialing
              ? `Sua assinatura termina junto com o teste, em ${day(billing.trialEnd!)}, e nada será cobrado.`
              : `O plano anual tem fidelidade: as parcelas continuam até completar o ciclo e seu acesso termina em ${day(commitmentEnd)}. Depois disso não há novas cobranças.`}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          {confirmingCancel ? (
            <>
              <button type="button" disabled={pending} onClick={() => setRenewal(false)} className={buttonDanger}>
                Confirmar cancelamento
              </button>
              <button type="button" disabled={pending} onClick={() => setConfirmingCancel(false)} className={buttonSecondary}>
                Voltar
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={pending} onClick={() => go(openBillingPortalAction)} className={pastDue ? buttonPrimary : buttonSecondary}>
                {commitmentEnd && !trialing ? "Cartão e faturas" : "Gerenciar assinatura"}
              </button>
              {commitmentEnd && !pastDue &&
                (endsAt ? (
                  <button type="button" disabled={pending} onClick={() => setRenewal(true)} className={buttonPrimary}>
                    Manter assinatura
                  </button>
                ) : (
                  <button type="button" disabled={pending} onClick={() => setConfirmingCancel(true)} className={buttonSecondary}>
                    Cancelar renovação
                  </button>
                ))}
            </>
          )}
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
            : `Todos os recursos liberados por ${brl(ANNUAL_INSTALLMENT_PRICE)} por mês no plano anual.`
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
        <button type="button" disabled={pending} onClick={() => go(() => startCheckoutAction({ plan: "annual" }))} className={buttonPrimary}>
          Plano anual · {brl(ANNUAL_INSTALLMENT_PRICE)}/mês
        </button>
        <button type="button" disabled={pending} onClick={() => go(() => startCheckoutAction({ plan: "monthly" }))} className={buttonSecondary}>
          Mensal · {brl(MONTHLY_PRICE)}/mês
        </button>
      </div>
      {toast}
    </Card>
  );
}
