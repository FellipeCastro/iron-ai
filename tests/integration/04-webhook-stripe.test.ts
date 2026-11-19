import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/stripe/route";
import { db, stripeEvents, subscriptions } from "@/db";
import { userHasAccess } from "@/lib/services/access";
import { createSubscription, createUser } from "./helpers/factories";
import { putCharge, putSubscription, sentryMock, stripeMock, stripeState } from "./helpers/mocks";
import { request, stripeEvent, stripeWebhookRequest } from "./helpers/requests";
import { withStripeTasks } from "./helpers/tasks";

const rows = () => db.select().from(subscriptions);
const unix = (ms: number) => Math.floor(ms / 1000);
const DAY = 86_400_000;

/** Usuário com cliente Stripe `cus_1`. */
const customer = (stripeCustomerId = "cus_1") => createUser({ stripeCustomerId });
const subEvent = (type: string, id: string, extra: Record<string, unknown> = {}) => stripeEvent(type, { id, object: "subscription", ...extra });
/** Entrega o evento ao webhook e roda a task que ele enfileirou (o worker do Trigger.dev). */
const send = (event: ReturnType<typeof stripeEvent>) => withStripeTasks(() => POST(stripeWebhookRequest(event)));

describe("POST /api/webhooks/stripe — assinatura do webhook", () => {
  it("quando falta o header stripe-signature, então 400", async () => {
    const res = await POST(stripeWebhookRequest(subEvent("customer.subscription.created", "sub_1"), { signature: null }));
    expect(res.status).toBe(400);
  });

  it("quando a assinatura é forjada, então 400 e o banco não muda", async () => {
    const user = await customer();
    putSubscription({ id: "sub_1", customer: "cus_1", status: "active" });
    const res = await POST(stripeWebhookRequest(subEvent("customer.subscription.created", "sub_1"), { secret: "whsec_atacante" }));
    expect(res.status).toBe(400);
    expect(await rows()).toHaveLength(0);
    expect(await userHasAccess(user.id)).toBe(false);
  });

  it("quando o corpo foi alterado depois de assinado, então 400 e o banco não muda", async () => {
    await customer();
    putSubscription({ id: "sub_1", customer: "cus_1", status: "active" });
    const signed = JSON.stringify(subEvent("customer.subscription.created", "sub_1"));
    const signature = stripeMock.webhooks.generateTestHeaderString({ payload: signed, secret: process.env.STRIPE_WEBHOOK_SECRET! });
    const res = await POST(request("/api/webhooks/stripe", { method: "POST", body: signed.replace("sub_1", "sub_2"), headers: { "stripe-signature": signature } }));
    expect(res.status).toBe(400);
    expect(await rows()).toHaveLength(0);
  });
});

describe("POST /api/webhooks/stripe — assinaturas", () => {
  it("quando chega customer.subscription.created de um cliente conhecido, então grava status, price, current_period_end, trial_end e cancel_at_period_end", async () => {
    const user = await customer();
    const periodEnd = unix(Date.now() + 30 * DAY);
    const trialEnd = unix(Date.now() + 7 * DAY);
    putSubscription({
      id: "sub_1",
      customer: "cus_1",
      status: "trialing",
      trial_end: trialEnd,
      cancel_at_period_end: true,
      items: { data: [{ price: { id: process.env.STRIPE_PRICE_ANNUAL }, current_period_end: periodEnd }] } as never,
    });

    const res = await send(subEvent("customer.subscription.created", "sub_1"));

    expect(res.status).toBe(200);
    expect(await rows()).toMatchObject([
      {
        userId: user.id,
        stripeSubscriptionId: "sub_1",
        status: "trialing",
        priceId: process.env.STRIPE_PRICE_ANNUAL,
        cancelAtPeriodEnd: true,
      },
    ]);
    const [row] = await rows();
    expect(row.currentPeriodEnd.getTime()).toBe(periodEnd * 1000);
    expect(row.trialEnd?.getTime()).toBe(trialEnd * 1000);
  });

  it.each([
    ["checkout.session.completed", { object: "checkout.session", id: "cs_1", subscription: "sub_1" }],
    ["invoice.paid", { object: "invoice", id: "in_1", parent: { subscription_details: { subscription: "sub_1" } } }],
    ["invoice.payment_failed", { object: "invoice", id: "in_1", parent: { subscription_details: { subscription: "sub_1" } } }],
  ])("quando chega %s, então sincroniza a assinatura referenciada", async (type, object) => {
    const user = await customer();
    putSubscription({ id: "sub_1", customer: "cus_1", status: "active" });
    const res = await send(stripeEvent(type, object));
    expect(res.status).toBe(200);
    expect(await rows()).toMatchObject([{ userId: user.id, stripeSubscriptionId: "sub_1", status: "active" }]);
  });

  it("quando invoice.payment_failed deixa a assinatura past_due, então o usuário mantém acesso", async () => {
    const user = await customer();
    putSubscription({ id: "sub_1", customer: "cus_1", status: "past_due" });
    await send(stripeEvent("invoice.payment_failed", { id: "in_1", parent: { subscription_details: { subscription: "sub_1" } } }));
    expect((await rows())[0].status).toBe("past_due");
    expect(await userHasAccess(user.id)).toBe(true);
  });

  it("quando customer.subscription.deleted chega, então o status vira canceled e o acesso é removido", async () => {
    const user = await customer();
    await createSubscription(user.id, { stripeSubscriptionId: "sub_1", status: "active" });
    putSubscription({ id: "sub_1", customer: "cus_1", status: "canceled" });

    await send(subEvent("customer.subscription.deleted", "sub_1"));

    expect((await rows())[0].status).toBe("canceled");
    expect(await userHasAccess(user.id)).toBe(false);
  });

  it("quando cancel_at_period_end é true, então o acesso continua até o fim do período", async () => {
    const user = await customer();
    putSubscription({ id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: true });
    await send(subEvent("customer.subscription.updated", "sub_1"));
    expect((await rows())[0].cancelAtPeriodEnd).toBe(true);
    expect(await userHasAccess(user.id)).toBe(true);
  });

  it("quando o mesmo evento chega duas vezes, então o banco fica igual (1 linha) e responde 200", async () => {
    await customer();
    putSubscription({ id: "sub_1", customer: "cus_1", status: "active" });
    const event = subEvent("customer.subscription.created", "sub_1");

    const first = await send(event);
    const before = await rows();
    const second = await send(event);

    expect([first.status, second.status]).toEqual([200, 200]);
    const after = await rows();
    expect(after).toHaveLength(1);
    // updatedAt e syncedFrom são carimbos de controle e avançam a cada sync; o resto precisa ficar igual.
    expect({ ...after[0], updatedAt: null, syncedFrom: null }).toEqual({ ...before[0], updatedAt: null, syncedFrom: null });
    expect(after[0].syncedFrom!.getTime()).toBeGreaterThanOrEqual(before[0].syncedFrom!.getTime());
  });

  it("quando 2 entregas do mesmo evento chegam ao mesmo tempo, então continua 1 linha e nenhuma dá erro", async () => {
    await customer();
    putSubscription({ id: "sub_1", customer: "cus_1", status: "active" });
    const event = subEvent("customer.subscription.created", "sub_1");

    const responses = await Promise.all([send(event), send(event), send(event)]);

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await rows()).toHaveLength(1);
  });

  it("quando chegam eventos fora de ordem, então vale o estado atual lido do Stripe, não a ordem de chegada", async () => {
    await customer();
    // O Stripe já está em "active"; um evento atrasado diz "incomplete" no corpo, mas o corpo é ignorado.
    putSubscription({ id: "sub_1", customer: "cus_1", status: "active" });
    await send(subEvent("customer.subscription.created", "sub_1", { status: "incomplete" }));
    await send(subEvent("customer.subscription.updated", "sub_1", { status: "trialing" }));
    expect((await rows())[0].status).toBe("active");
  });

  it("quando o evento é de um cliente sem usuário local, então responde 200, não grava nada", async () => {
    putSubscription({ id: "sub_ghost", customer: "cus_ghost", status: "active" });
    const res = await send(subEvent("customer.subscription.created", "sub_ghost"));
    expect(res.status).toBe(200);
    expect(await rows()).toHaveLength(0);
  });

  it("quando o evento de uma assinatura ANTIGA chega depois de uma nova ativa, então a nova não é sobrescrita", async () => {
    const user = await customer();
    await createSubscription(user.id, { stripeSubscriptionId: "sub_new", status: "active" });
    putSubscription({ id: "sub_old", customer: "cus_1", status: "canceled" });

    await send(subEvent("customer.subscription.deleted", "sub_old"));

    expect(await rows()).toMatchObject([{ stripeSubscriptionId: "sub_new", status: "active" }]);
  });

  it("quando uma assinatura antiga já terminou e o usuário assina de novo, então a nova substitui a antiga", async () => {
    const user = await customer();
    await createSubscription(user.id, { stripeSubscriptionId: "sub_old", status: "canceled" });
    putSubscription({ id: "sub_new", customer: "cus_1", status: "active" });

    await send(subEvent("customer.subscription.created", "sub_new"));

    expect(await rows()).toMatchObject([{ stripeSubscriptionId: "sub_new", status: "active" }]);
    expect(await userHasAccess(user.id)).toBe(true);
  });

  it("quando o Stripe falha ao ler a assinatura, então a task falha (o Trigger.dev tenta de novo) e o evento fica sem processed_at", async () => {
    await customer();
    putSubscription({ id: "sub_1", customer: "cus_1", status: "active" });
    stripeState.fail.set("subscriptions.retrieve", new Error("stripe down"));
    let status = 0;
    await expect(withStripeTasks(async () => (status = (await POST(stripeWebhookRequest(subEvent("customer.subscription.created", "sub_1")))).status))).rejects.toThrow("stripe down");
    // O webhook já respondeu 200: quem tenta de novo agora é o Trigger.dev.
    expect(status).toBe(200);
    expect(await db.select().from(stripeEvents)).toMatchObject([{ processedAt: null }]);
    expect(await rows()).toHaveLength(0);
  });
});

describe("POST /api/webhooks/stripe — eventos de risco", () => {
  /** Usuário com assinatura ativa local e no Stripe. */
  async function activeCustomer() {
    const user = await customer();
    await createSubscription(user.id, { stripeSubscriptionId: "sub_1", status: "active" });
    putSubscription({ id: "sub_1", customer: "cus_1", status: "active" });
    return user;
  }

  it("quando chega charge.dispute.created, então cancela todas as assinaturas vivas do cliente e o acesso acaba na hora", async () => {
    const user = await activeCustomer();
    putSubscription({ id: "sub_2", customer: "cus_1", status: "trialing" });
    putCharge({ id: "ch_1", customer: "cus_1" });

    const res = await send(stripeEvent("charge.dispute.created", { id: "dp_1", charge: "ch_1", reason: "fraudulent", amount: 1000 }));

    expect(res.status).toBe(200);
    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledTimes(2);
    expect((await rows())[0].status).toBe("canceled");
    expect(await userHasAccess(user.id)).toBe(false);
  });

  it("quando chega charge.refunded TOTAL, então cancela as assinaturas", async () => {
    const user = await activeCustomer();
    putCharge({ id: "ch_1", customer: "cus_1", refunded: true });
    const res = await send(stripeEvent("charge.refunded", { id: "ch_1", customer: "cus_1", refunded: true }));
    expect(res.status).toBe(200);
    expect((await rows())[0].status).toBe("canceled");
    expect(await userHasAccess(user.id)).toBe(false);
  });

  it("quando chega charge.refunded PARCIAL, então nada é cancelado", async () => {
    const user = await activeCustomer();
    putCharge({ id: "ch_1", customer: "cus_1", refunded: false });
    const res = await send(stripeEvent("charge.refunded", { id: "ch_1", customer: "cus_1", refunded: false }));
    expect(res.status).toBe(200);
    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
    expect((await rows())[0].status).toBe("active");
    expect(await userHasAccess(user.id)).toBe(true);
  });

  it("quando chega early_fraud_warning, então só alerta (nenhuma assinatura muda)", async () => {
    await activeCustomer();
    const res = await send(stripeEvent("radar.early_fraud_warning.created", { id: "issfr_1", fraud_type: "card_never_received", actionable: true }));
    expect(res.status).toBe(200);
    expect(sentryMock.captureEvent).toHaveBeenCalledWith(expect.objectContaining({ message: "Stripe early fraud warning", level: "warning" }));
    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
    expect(await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, "sub_1"))).toMatchObject([{ status: "active" }]);
  });

  it("quando chega um tipo de evento desconhecido, então 200 sem efeito", async () => {
    await activeCustomer();
    const res = await send(stripeEvent("customer.created", { id: "cus_9" }));
    expect(res.status).toBe(200);
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
    expect((await rows())[0].status).toBe("active");
    // Tipo que o app não trata: nada é reivindicado nem enfileirado.
    expect(await db.select().from(stripeEvents)).toHaveLength(0);
  });
});
