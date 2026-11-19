import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { startCheckoutAction } from "@/app/(app)/actions";
import { POST } from "@/app/api/webhooks/stripe/route";
import { db, idempotentRequests, stripeEvents, subscriptions } from "@/db";
import { runOnce } from "@/lib/idempotency";
import { userHasAccess } from "@/lib/services/access";
import { processStripeEvent, type StripeEventPayload } from "@/trigger/stripe-events";
import { createSubscription, createUser } from "./helpers/factories";
import { putCharge, putSubscription, sentryMock, signIn, stripeMock, stripeState, triggerMock } from "./helpers/mocks";
import { stripeEvent, stripeWebhookRequest } from "./helpers/requests";
import { runTask, stripeTaskCalls, withStripeTasks } from "./helpers/tasks";

// Repetir um evento ou uma requisição de pagamento (reentrega, retry, duplo clique, chamadas em paralelo) tem
// efeito uma vez só. Cada caso manda a MESMA coisa 2 vezes em sequência e 2 vezes ao mesmo tempo.

const deliver = (event: ReturnType<typeof stripeEvent>) => POST(stripeWebhookRequest(event));
const events = () => db.select().from(stripeEvents);
const subs = () => db.select().from(subscriptions);

describe("webhook do Stripe: o mesmo evento tem efeito 1 vez", () => {
  const subscriptionCreated = () => stripeEvent("customer.subscription.created", { id: "sub_1", object: "subscription" });

  async function customerWithSubscriptionInStripe() {
    const user = await createUser({ stripeCustomerId: "cus_1" });
    putSubscription({ id: "sub_1", customer: "cus_1", status: "active" });
    return user;
  }

  it("quando o mesmo evento de assinatura chega 2 vezes em sequência, então 200 nas duas, 1 evento gravado, 1 run e 1 sincronização", async () => {
    const user = await customerWithSubscriptionInStripe();
    const event = subscriptionCreated();

    const first = await withStripeTasks(() => deliver(event));
    const second = await withStripeTasks(() => deliver(event));

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(await events()).toMatchObject([{ eventId: event.id, type: event.type, processedAt: expect.any(Date) }]);
    expect(stripeTaskCalls()).toHaveLength(1);
    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledTimes(1);
    expect(await subs()).toHaveLength(1);
    expect(await userHasAccess(user.id)).toBe(true);
  });

  it("quando o mesmo evento de assinatura chega 2 vezes ao mesmo tempo, então 200 nas duas e só 1 é processado", async () => {
    await customerWithSubscriptionInStripe();
    const event = subscriptionCreated();

    const responses = await withStripeTasks(() => Promise.all([deliver(event), deliver(event)]));

    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(await events()).toHaveLength(1);
    expect(stripeTaskCalls()).toHaveLength(1);
    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledTimes(1);
    expect(await subs()).toHaveLength(1);
  });

  describe("disputa (cancela a assinatura e alerta)", () => {
    async function disputedCustomer() {
      const user = await createUser({ stripeCustomerId: "cus_1" });
      await createSubscription(user.id, { stripeSubscriptionId: "sub_1", status: "active" });
      putSubscription({ id: "sub_1", customer: "cus_1", status: "active" });
      putCharge({ id: "ch_1", customer: "cus_1" });
      return user;
    }
    const dispute = () => stripeEvent("charge.dispute.created", { id: "dp_1", object: "dispute", charge: "ch_1", reason: "fraudulent", amount: 1000 });
    const alerts = () => sentryMock.captureEvent.mock.calls.filter(([event]) => event.message === "Stripe dispute opened");

    it("quando a mesma disputa chega 2 vezes em sequência, então cancela 1 vez e alerta 1 vez", async () => {
      const user = await disputedCustomer();
      const event = dispute();

      const first = await withStripeTasks(() => deliver(event));
      const second = await withStripeTasks(() => deliver(event));

      expect([first.status, second.status]).toEqual([200, 200]);
      expect(stripeMock.subscriptions.cancel).toHaveBeenCalledTimes(1);
      expect(alerts()).toHaveLength(1);
      expect(await userHasAccess(user.id)).toBe(false);
    });

    it("quando a mesma disputa chega 2 vezes ao mesmo tempo, então cancela 1 vez e alerta 1 vez", async () => {
      const user = await disputedCustomer();
      const event = dispute();

      const responses = await withStripeTasks(() => Promise.all([deliver(event), deliver(event)]));

      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      expect(stripeMock.subscriptions.cancel).toHaveBeenCalledTimes(1);
      expect(alerts()).toHaveLength(1);
      expect(await userHasAccess(user.id)).toBe(false);
    });

    it("quando a task do mesmo evento roda 2 vezes ao mesmo tempo, então as 2 usam a mesma idempotency key no cancelamento e nenhuma falha", async () => {
      await disputedCustomer();
      const event = dispute();
      await deliver(event);
      const [[, payload]] = stripeTaskCalls();

      await Promise.all([runTask(processStripeEvent, payload as StripeEventPayload), runTask(processStripeEvent, payload as StripeEventPayload)]);

      const keys = stripeMock.subscriptions.cancel.mock.calls.map(([, , options]) => (options as { idempotencyKey?: string }).idempotencyKey);
      expect(keys.length).toBeGreaterThanOrEqual(1);
      expect(new Set(keys)).toEqual(new Set([`risk-cancel-${event.id}-sub_1`]));
      // Uma só operação no Stripe: a segunda chamada (se houve) recebeu a resposta guardada.
      expect([...stripeState.idempotency.keys()].filter((k) => k.startsWith("subscription-cancel:"))).toHaveLength(1);
      expect(stripeState.subscriptions.get("sub_1")!.status).toBe("canceled");
    });

    it("quando a task do mesmo evento roda de novo depois de concluída, então nada é repetido", async () => {
      await disputedCustomer();
      const event = dispute();
      await withStripeTasks(() => deliver(event));
      const [[, payload]] = stripeTaskCalls();

      const again = await runTask<StripeEventPayload, { skipped: boolean }>(processStripeEvent, payload as StripeEventPayload);

      expect(again).toEqual({ skipped: true });
      expect(stripeMock.subscriptions.cancel).toHaveBeenCalledTimes(1);
      expect(alerts()).toHaveLength(1);
    });
  });

  it("quando o reembolso diz 'total' no corpo mas o Stripe diz que é parcial, então vale o Stripe e nada é cancelado", async () => {
    const user = await createUser({ stripeCustomerId: "cus_1" });
    await createSubscription(user.id, { stripeSubscriptionId: "sub_1", status: "active" });
    putSubscription({ id: "sub_1", customer: "cus_1", status: "active" });
    putCharge({ id: "ch_1", customer: "cus_1", refunded: false });

    await withStripeTasks(() => deliver(stripeEvent("charge.refunded", { id: "ch_1", object: "charge", customer: "cus_1", refunded: true })));

    expect(stripeMock.charges.retrieve).toHaveBeenCalledWith("ch_1");
    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
    expect(await userHasAccess(user.id)).toBe(true);
  });

  it("quando o reembolso parcial chega depois do total (ordem invertida), então só o evento do reembolso total cancela", async () => {
    const user = await createUser({ stripeCustomerId: "cus_1" });
    await createSubscription(user.id, { stripeSubscriptionId: "sub_1", status: "active" });
    putSubscription({ id: "sub_1", customer: "cus_1", status: "active" });
    putCharge({ id: "ch_1", customer: "cus_1", refunded: true });

    const full = stripeEvent("charge.refunded", { id: "ch_1", object: "charge", customer: "cus_1", refunded: true });
    const partial = stripeEvent("charge.refunded", { id: "ch_1", object: "charge", customer: "cus_1", refunded: false });
    await withStripeTasks(async () => {
      await deliver(full);
      await deliver(partial);
    });
    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledTimes(1);

    // Nova assinatura do mesmo cliente: o evento parcial atrasado não pode cancelá-la.
    putSubscription({ id: "sub_2", customer: "cus_1", status: "active" });
    await withStripeTasks(() => deliver(stripeEvent("charge.refunded", { id: "ch_1", object: "charge", customer: "cus_1", refunded: false })));
    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledTimes(1);
    expect(stripeState.subscriptions.get("sub_2")!.status).toBe("active");
  });

  it("quando enfileirar falha, então 500, o registro do evento é mantido e a reentrega do Stripe é processada", async () => {
    const user = await customerWithSubscriptionInStripe();
    const event = subscriptionCreated();
    triggerMock.trigger.mockRejectedValueOnce(new Error("trigger down"));

    const failed = await deliver(event);
    expect(failed.status).toBe(500);
    expect(await events()).toMatchObject([{ eventId: event.id, processedAt: null }]);

    const retried = await withStripeTasks(() => deliver(event));
    expect(retried.status).toBe(200);
    expect(await events()).toMatchObject([{ eventId: event.id, processedAt: expect.any(Date) }]);
    expect(await userHasAccess(user.id)).toBe(true);
  });
});

describe("startCheckoutAction com Idempotency-Key", () => {
  const keyRows = () => db.select().from(idempotentRequests);

  async function signedInUser() {
    const user = await createUser();
    signIn(user.clerkId);
    return user;
  }

  it("quando a mesma chave chega 2 vezes em sequência, então devolve a mesma resposta e abre o Checkout 1 vez", async () => {
    await signedInUser();
    const idempotencyKey = randomUUID();

    const first = await startCheckoutAction({ plan: "monthly", idempotencyKey });
    const second = await startCheckoutAction({ plan: "monthly", idempotencyKey });

    expect(first).toMatchObject({ ok: true, data: { url: expect.stringContaining("checkout.stripe.test") } });
    expect(second).toEqual(first);
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(await keyRows()).toMatchObject([{ key: idempotencyKey, scope: "checkout", fingerprint: "monthly", response: { value: (first as { data: { url: string } }).data.url } }]);
  });

  it("quando a mesma chave chega 2 vezes ao mesmo tempo, então as 2 recebem a mesma URL e o Checkout é aberto 1 vez", async () => {
    await signedInUser();
    const idempotencyKey = randomUUID();

    const results = await Promise.all([startCheckoutAction({ plan: "monthly", idempotencyKey }), startCheckoutAction({ plan: "monthly", idempotencyKey })]);

    expect(results[0]).toMatchObject({ ok: true });
    expect(results[1]).toEqual(results[0]);
    expect(stripeMock.customers.create).toHaveBeenCalledTimes(1);
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(await keyRows()).toHaveLength(1);
  });

  it.each(["nao-e-uuid", "6ba7b810-9dad-11d1-80b4-00c04fd430c8" /* UUID v1 */])("quando a chave não é UUID v4 (%s), então erro e o Stripe não é chamado", async (idempotencyKey) => {
    await signedInUser();
    const result = await startCheckoutAction({ plan: "monthly", idempotencyKey });
    expect(result).toEqual({ ok: false, error: "Tentativa de pagamento inválida. Recarregue a página." });
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("quando a mesma chave é reusada com outro plano, então erro e nenhum Checkout novo", async () => {
    await signedInUser();
    const idempotencyKey = randomUUID();

    await startCheckoutAction({ plan: "monthly", idempotencyKey });
    const other = await startCheckoutAction({ plan: "annual", idempotencyKey });

    expect(other).toEqual({ ok: false, error: "Essa tentativa de pagamento era de outro plano. Recarregue a página." });
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it("quando outro usuário usa a mesma chave, então não recebe a resposta do primeiro", async () => {
    const idempotencyKey = randomUUID();
    await signedInUser();
    const first = await startCheckoutAction({ plan: "monthly", idempotencyKey });
    await signedInUser();
    const second = await startCheckoutAction({ plan: "monthly", idempotencyKey });

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    expect(second).not.toEqual(first);
    expect(await keyRows()).toHaveLength(2);
  });

  it("quando a primeira tentativa falha no Stripe, então a mesma chave pode tentar de novo e abre o Checkout", async () => {
    await signedInUser();
    const idempotencyKey = randomUUID();
    stripeState.fail.set("checkout.sessions.create", new Error("stripe down"));

    const failed = await startCheckoutAction({ plan: "monthly", idempotencyKey });
    expect(failed).toMatchObject({ ok: false });
    expect(await keyRows()).toHaveLength(0);

    stripeState.fail.clear();
    const retried = await startCheckoutAction({ plan: "monthly", idempotencyKey });
    expect(retried).toMatchObject({ ok: true, data: { url: expect.stringContaining("checkout.stripe.test") } });
  });

  it("quando a chave ficou presa por uma requisição que morreu no meio, então outra requisição assume e conclui", async () => {
    const user = await signedInUser();
    const idempotencyKey = randomUUID();
    await db.insert(idempotentRequests).values({ userId: user.id, scope: "checkout", key: idempotencyKey, fingerprint: "monthly", createdAt: new Date(Date.now() - 60_000) });

    const result = await startCheckoutAction({ plan: "monthly", idempotencyKey });

    expect(result).toMatchObject({ ok: true, data: { url: expect.stringContaining("checkout.stripe.test") } });
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it("quando o antecessor ainda vivo falha depois da tomada, então a limpeza dele não apaga a reivindicação do substituto", async () => {
    const user = await signedInUser();
    const key = randomUUID();
    const req = { userId: user.id, scope: "checkout", key, fingerprint: "monthly" };
    const row = async () => (await keyRows()).find((r) => r.key === key);
    const gate = () => {
      let release!: () => void;
      const opened = new Promise<void>((resolve) => (release = resolve));
      return { opened, release };
    };
    const predecessorGate = gate();
    const replacementGate = gate();

    // O antecessor reivindica a chave e fica preso na operação (vivo, mas lento).
    const predecessor = runOnce(req, async () => {
      await predecessorGate.opened;
      throw new Error("stripe down");
    });
    const predecessorResult = predecessor.then(
      () => "ok",
      () => "failed",
    );
    await vi.waitFor(async () => expect(await row()).toBeDefined());
    const predecessorToken = (await row())!.claimToken;
    await db.update(idempotentRequests).set({ createdAt: new Date(Date.now() - 60_000) }).where(and(eq(idempotentRequests.userId, user.id), eq(idempotentRequests.key, key)));

    // O substituto assume a reivindicação envelhecida e também fica preso na operação.
    const replacement = runOnce(req, async () => {
      await replacementGate.opened;
      return "replacement";
    });
    await vi.waitFor(async () => expect((await row())!.claimToken).not.toBe(predecessorToken));
    const replacementToken = (await row())!.claimToken;

    // O antecessor falha agora: a limpeza dele não pode tocar na reivindicação do substituto.
    predecessorGate.release();
    expect(await predecessorResult).toBe("failed");
    expect(await row()).toMatchObject({ claimToken: replacementToken, response: null });

    replacementGate.release();
    expect(await replacement).toBe("replacement");
    expect(await row()).toMatchObject({ claimToken: replacementToken, response: { value: "replacement" } });
  });
});
