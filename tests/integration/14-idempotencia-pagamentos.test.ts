import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { startCheckoutAction } from "@/app/(app)/actions";
import { POST } from "@/app/api/webhooks/stripe/route";
import { checkoutSlots, db, duplicateCleanups, idempotentRequests, stripeEvents, subscriptions } from "@/db";
import { runOnce } from "@/lib/idempotency";
import { DASHBOARD_URL } from "@/lib/routes";
import { userHasAccess } from "@/lib/services/access";
import { processStripeEvent, type StripeEventPayload } from "@/trigger/stripe-events";
import { createSubscription, createUser } from "./helpers/factories";
import { putCharge, putSubscription, sentryMock, signIn, stripeMock, stripeServerError, stripeState, triggerMock } from "./helpers/mocks";
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

describe("checkout: no máximo 1 Checkout Session pagável por usuário, com qualquer Idempotency-Key", () => {
  const openSessions = () => [...stripeState.sessions.values()].filter((s) => s.status === "open");
  const urlOf = (r: Awaited<ReturnType<typeof startCheckoutAction>>) => (r.ok ? r.data.url : null);
  const slotOf = async (userId: string) => (await db.select().from(checkoutSlots).where(eq(checkoutSlots.userId, userId)))[0];

  async function signedInUser() {
    const user = await createUser();
    signIn(user.clerkId);
    return user;
  }

  it("quando 2 abas, chaves diferentes, ao mesmo tempo (planos diferentes), então só 1 Session fica pagável", async () => {
    const user = await signedInUser();

    const results = await Promise.all([
      startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() }),
      startCheckoutAction({ plan: "annual", idempotencyKey: randomUUID() }),
    ]);

    expect(openSessions()).toHaveLength(1);
    // A aba que rodou por último fica com a Session aberta; a outra recebeu uma que já foi expirada (não pagável).
    expect(results.map(urlOf)).toContain(openSessions()[0].url);
    expect(stripeState.customers.size).toBe(1);
    // A reivindicação terminou livre e aponta para a Session aberta.
    expect(await slotOf(user.id)).toMatchObject({ leaseToken: null, sessionId: openSessions()[0].id });
  });

  it("quando 2 abas, chaves diferentes, ao mesmo tempo (mesmo plano), então as 2 recebem a mesma Session e só 1 é criada", async () => {
    await signedInUser();

    const results = await Promise.all([
      startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() }),
      startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() }),
    ]);

    expect(results.every((r) => r.ok)).toBe(true);
    expect(new Set(results.map(urlOf)).size).toBe(1);
    expect(stripeState.sessions.size).toBe(1);
    expect(openSessions()).toHaveLength(1);
  });

  it("quando 3 abas, chaves diferentes, ao mesmo tempo (planos alternados), então só 1 Session fica pagável", async () => {
    await signedInUser();

    await Promise.all((["monthly", "annual", "monthly"] as const).map((plan) => startCheckoutAction({ plan, idempotencyKey: randomUUID() })));

    expect(openSessions()).toHaveLength(1);
  });

  it("quando a Session anterior expirou e o usuário tenta de novo com chave nova, então abre uma Session nova (a chave do Stripe avança)", async () => {
    const user = await signedInUser();
    const first = await startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() });
    const firstSession = openSessions()[0];
    // Expirou sozinha no Stripe (24 h).
    firstSession.status = "expired";
    firstSession.url = null;

    const second = await startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() });

    expect(urlOf(second)).not.toBe(urlOf(first));
    expect(openSessions()).toHaveLength(1);
    const keys = stripeMock.checkout.sessions.create.mock.calls.map(([, options]) => (options as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toEqual([`checkout-${user.id}-g0`, `checkout-${user.id}-g1`]);
  });

  it("quando a chave do Stripe é reusada para outro plano, então o Stripe recusa em vez de abrir uma 2ª Session", async () => {
    const user = await signedInUser();
    await startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() });

    // Uma requisição que ficou com a geração antiga (lease tomado) tenta o outro plano com a mesma chave.
    await expect(
      stripeMock.checkout.sessions.create({ customer: openSessions()[0].customer, metadata: { plan: "annual" } }, { idempotencyKey: `checkout-${user.id}-g0` }),
    ).rejects.toThrow(/same parameters/);
    expect(openSessions()).toHaveLength(1);
  });

  it("quando outra requisição segura a reivindicação, então esta espera ela terminar antes de abrir o Checkout", async () => {
    const user = await signedInUser();
    await db.insert(checkoutSlots).values({ userId: user.id, leaseToken: randomUUID(), leasedAt: new Date() });

    const pending = startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    await db.update(checkoutSlots).set({ leaseToken: null, leasedAt: null }).where(eq(checkoutSlots.userId, user.id));

    expect(await pending).toMatchObject({ ok: true, data: { url: expect.stringContaining("checkout.stripe.test") } });
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it("quando a reivindicação ficou presa por uma requisição que morreu, então outra assume depois do prazo e conclui", async () => {
    const user = await signedInUser();
    await db.insert(checkoutSlots).values({ userId: user.id, leaseToken: randomUUID(), leasedAt: new Date(Date.now() - 60_000) });

    const result = await startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() });

    expect(result).toMatchObject({ ok: true, data: { url: expect.stringContaining("checkout.stripe.test") } });
    expect(await slotOf(user.id)).toMatchObject({ leaseToken: null, generation: 0 });
  });

  /** Primeiro Checkout (mensal) aberto e gravado na reivindicação, mais uma Session anual aberta que sobrou de outra requisição. */
  async function reusableAndStaleSession() {
    const user = await signedInUser();
    const first = await startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() });
    const reusable = openSessions()[0];
    const stale = { id: "cs_test_stale", url: "https://checkout.stripe.test/cs_test_stale", customer: reusable.customer, status: "open" as const, metadata: { plan: "annual" }, created: reusable.created };
    stripeState.sessions.set(stale.id, stale);
    return { user, first, reusable, stale };
  }

  it("quando há uma Session reutilizável e outra aberta (outro plano), então reusa a do plano e expira a outra", async () => {
    const { first, reusable } = await reusableAndStaleSession();

    const again = await startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() });

    expect(urlOf(again)).toBe(urlOf(first));
    expect(openSessions().map((s) => s.id)).toEqual([reusable.id]);
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it("quando a outra Session aberta é paga durante a limpeza, então vai para o painel e a reutilizável também é expirada", async () => {
    const { reusable, stale } = await reusableAndStaleSession();
    stripeMock.checkout.sessions.expire.mockImplementationOnce(async (id: string) => {
      // Paga no instante em que ia ser expirada: o expire falha e o retrieve mostra a Session concluída.
      Object.assign(stripeState.sessions.get(id)!, { status: "complete", url: null, subscription: "sub_paid" });
      putSubscription({ id: "sub_paid", customer: stale.customer!, status: "active" });
      throw new Error("Checkout Session is not expirable");
    });

    const result = await startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() });

    expect(urlOf(result)).toContain(DASHBOARD_URL);
    expect(stripeState.sessions.get(reusable.id)!.status).toBe("expired");
    expect(openSessions()).toHaveLength(0);
  });

  it("quando a Session gravada foi paga e a assinatura ainda está incompleta, então vai para o painel e não abre outra", async () => {
    const user = await signedInUser();
    await startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() });
    const recorded = openSessions()[0];
    Object.assign(recorded, { status: "complete", url: null, subscription: "sub_pending" });
    putSubscription({ id: "sub_pending", customer: recorded.customer!, status: "incomplete" });

    const result = await startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() });

    expect(urlOf(result)).toContain(DASHBOARD_URL);
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(await slotOf(user.id)).toMatchObject({ generation: 0, sessionId: recorded.id });
  });

  it("quando a Session gravada foi paga mas a assinatura dela já terminou, então abre uma Session nova com a chave seguinte", async () => {
    const user = await signedInUser();
    await startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() });
    const recorded = openSessions()[0];
    Object.assign(recorded, { status: "complete", url: null, subscription: "sub_ended" });
    putSubscription({ id: "sub_ended", customer: recorded.customer!, status: "incomplete_expired" });

    const result = await startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() });

    expect(urlOf(result)).toContain("checkout.stripe.test");
    expect(openSessions()).toHaveLength(1);
    expect(await slotOf(user.id)).toMatchObject({ generation: 1 });
  });

  it("quando o Stripe guardou um 500 para a chave e nenhuma Session foi aberta com ela, então só a repetição avança a chave", async () => {
    const user = await signedInUser();
    stripeMock.checkout.sessions.create.mockRejectedValueOnce(stripeServerError(false)).mockRejectedValueOnce(stripeServerError(true));

    // 500 novo: a criação pode ainda estar em andamento, então a chave fica.
    expect(await startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() })).toMatchObject({ ok: false });
    expect(await slotOf(user.id)).toMatchObject({ generation: 0, leaseToken: null });

    // 500 repetido: nenhuma Session tem a chave, então a geração avança e o Checkout abre.
    const retried = await startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() });

    expect(urlOf(retried)).toContain("checkout.stripe.test");
    const keys = stripeMock.checkout.sessions.create.mock.calls.map(([, options]) => (options as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toEqual([`checkout-${user.id}-g0`, `checkout-${user.id}-g0`, `checkout-${user.id}-g1`]);
    expect(openSessions()).toHaveLength(1);
  });

  it("quando o Stripe guardou um 500 mas a Session da chave foi aberta, então devolve essa Session sem avançar a chave", async () => {
    const user = await signedInUser();
    stripeMock.checkout.sessions.create.mockImplementationOnce(async (params: { customer?: string; metadata?: Record<string, string> }) => {
      // A criação aconteceu, mas a resposta guardada para a chave é um 500.
      const id = "cs_test_lost";
      stripeState.sessions.set(id, { id, url: `https://checkout.stripe.test/${id}`, customer: params.customer, status: "open", metadata: params.metadata ?? {}, created: Math.floor(Date.now() / 1000) });
      throw stripeServerError(true);
    });

    const result = await startCheckoutAction({ plan: "monthly", idempotencyKey: randomUUID() });

    expect(urlOf(result)).toBe("https://checkout.stripe.test/cs_test_lost");
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(await slotOf(user.id)).toMatchObject({ generation: 0, sessionId: "cs_test_lost" });
  });
});

describe("webhook do Stripe: cliente com 2 assinaturas vivas (cobrança dupla)", () => {
  const unix = (ms: number) => Math.floor(ms / 1000);
  const duplicateAlerts = () => sentryMock.captureEvent.mock.calls.filter(([event]) => event.message === "Stripe duplicate subscription cancelled and refunded");
  const created = (id: string) => stripeEvent("customer.subscription.created", { id, object: "subscription" });

  /** sub_1 (mais antiga, já sincronizada) e sub_2 (paga depois, noutra aba), as 2 ativas no Stripe. */
  async function doublyChargedCustomer(localSubscription = "sub_1") {
    const user = await createUser({ stripeCustomerId: "cus_1" });
    await createSubscription(user.id, { stripeSubscriptionId: localSubscription, status: "active" });
    putSubscription({ id: "sub_1", customer: "cus_1", status: "active", created: unix(Date.now() - 60_000), latest_invoice: "in_1" });
    putSubscription({ id: "sub_2", customer: "cus_1", status: "active", created: unix(Date.now()), latest_invoice: "in_2" });
    stripeState.invoicePayments.set("in_1", ["pi_1"]);
    stripeState.invoicePayments.set("in_2", ["pi_2"]);
    return user;
  }

  it("quando chega o evento da assinatura nova, então cancela a mais nova, estorna a fatura dela (chaves pelo evento) e alerta 1 vez", async () => {
    const user = await doublyChargedCustomer();
    const event = created("sub_2");

    await withStripeTasks(() => deliver(event));

    expect(stripeState.subscriptions.get("sub_2")!.status).toBe("canceled");
    expect(stripeState.subscriptions.get("sub_1")!.status).toBe("active");
    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith("sub_2", {}, { idempotencyKey: `duplicate-cancel-${event.id}-sub_2` });
    expect(stripeMock.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_2", reason: "duplicate" }), {
      idempotencyKey: `duplicate-refund-${event.id}-pi_2`,
    });
    expect(stripeState.refunds.map((r) => r.payment_intent)).toEqual(["pi_2"]);
    expect(duplicateAlerts()).toHaveLength(1);
    expect(duplicateAlerts()[0][0]).toMatchObject({
      level: "warning",
      extra: expect.objectContaining({ kept_subscription_id: "sub_1", cancelled_subscription_ids: ["sub_2"] }),
    });
    expect(await subs()).toMatchObject([{ userId: user.id, stripeSubscriptionId: "sub_1", status: "active" }]);
    expect(await userHasAccess(user.id)).toBe(true);
  });

  it("quando a assinatura nova ocupou a linha local primeiro, então depois do cancelamento a antiga volta a valer", async () => {
    const user = await doublyChargedCustomer("sub_2");

    await withStripeTasks(() => deliver(created("sub_1")));

    expect(stripeState.subscriptions.get("sub_2")!.status).toBe("canceled");
    expect(await subs()).toMatchObject([{ userId: user.id, stripeSubscriptionId: "sub_1", status: "active" }]);
    expect(await userHasAccess(user.id)).toBe(true);
  });

  it("quando o mesmo evento chega 2 vezes e a task ainda roda de novo, então cancela, estorna e alerta 1 vez", async () => {
    await doublyChargedCustomer();
    const event = created("sub_2");

    await withStripeTasks(() => deliver(event));
    await withStripeTasks(() => deliver(event));
    // Retry da run depois de um crash antes de marcar o evento como processado.
    const [[, payload]] = stripeTaskCalls();
    await db.update(stripeEvents).set({ processedAt: null }).where(eq(stripeEvents.eventId, event.id));
    await runTask(processStripeEvent, payload as StripeEventPayload);

    expect(stripeState.refunds).toHaveLength(1);
    expect([...stripeState.idempotency.keys()].filter((k) => k.startsWith("subscription-cancel:"))).toHaveLength(1);
    expect(duplicateAlerts()).toHaveLength(1);
  });

  it("quando os eventos das 2 assinaturas são processados ao mesmo tempo, então só 1 cancela, estorna e alerta", async () => {
    await doublyChargedCustomer();
    await deliver(created("sub_1"));
    await deliver(created("sub_2"));
    const payloads = stripeTaskCalls().map(([, payload]) => payload as StripeEventPayload);
    expect(payloads).toHaveLength(2);

    await Promise.all(payloads.map((p) => runTask(processStripeEvent, p)));

    expect(stripeState.subscriptions.get("sub_1")!.status).toBe("active");
    expect(stripeState.subscriptions.get("sub_2")!.status).toBe("canceled");
    expect(stripeState.refunds.map((r) => r.payment_intent)).toEqual(["pi_2"]);
    expect(duplicateAlerts()).toHaveLength(1);
  });

  it("quando chega o charge.refunded do nosso próprio estorno, então a assinatura mantida NÃO é cancelada", async () => {
    const user = await doublyChargedCustomer();
    await withStripeTasks(() => deliver(created("sub_2")));
    putCharge({ id: "ch_2", customer: "cus_1", refunded: true });

    await withStripeTasks(() => deliver(stripeEvent("charge.refunded", { id: "ch_2", object: "charge", customer: "cus_1", refunded: true })));

    expect(stripeState.subscriptions.get("sub_1")!.status).toBe("active");
    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledTimes(1);
    expect(await userHasAccess(user.id)).toBe(true);
  });

  it("quando a listagem de assinaturas tem mais de 1 página, então a mais antiga (na última página) é a mantida", async () => {
    const user = await doublyChargedCustomer();
    stripeState.pageSize = 1; // mais novas primeiro: sub_2 na página 1, sub_1 só na página 2

    await withStripeTasks(() => deliver(created("sub_2")));

    expect(stripeState.subscriptions.get("sub_1")!.status).toBe("active");
    expect(stripeState.subscriptions.get("sub_2")!.status).toBe("canceled");
    expect(await subs()).toMatchObject([{ userId: user.id, stripeSubscriptionId: "sub_1" }]);
  });

  it("quando o estorno falha depois do cancelamento, então o retry estorna (mesma chave) e alerta, mesmo a assinatura já não estando viva", async () => {
    await doublyChargedCustomer();
    const event = created("sub_2");
    stripeState.fail.set("refunds.create", new Error("stripe down"));

    await expect(withStripeTasks(() => deliver(event))).rejects.toThrow("stripe down");
    expect(stripeState.subscriptions.get("sub_2")!.status).toBe("canceled");
    expect(stripeState.refunds).toHaveLength(0);
    expect(await db.select().from(duplicateCleanups)).toMatchObject([{ subscriptionId: "sub_2", operationId: event.id, completedAt: null }]);

    stripeState.fail.clear();
    const [[, payload]] = stripeTaskCalls();
    await runTask(processStripeEvent, payload as StripeEventPayload);

    expect(stripeState.refunds.map((r) => r.payment_intent)).toEqual(["pi_2"]);
    expect(stripeMock.refunds.create).toHaveBeenLastCalledWith(expect.anything(), { idempotencyKey: `duplicate-refund-${event.id}-pi_2` });
    expect(await db.select().from(duplicateCleanups)).toMatchObject([{ subscriptionId: "sub_2", refundedAmount: 1000, completedAt: expect.any(Date) }]);
    expect(duplicateAlerts()).toHaveLength(1);
  });

  it("quando o Sentry não confirma o alerta, então o retry alerta de novo mesmo sem nada novo a cancelar", async () => {
    await doublyChargedCustomer();
    const event = created("sub_2");
    sentryMock.flush.mockResolvedValueOnce(false);

    await expect(withStripeTasks(() => deliver(event))).rejects.toThrow(/did not acknowledge/);
    expect((await events())[0].alertedAt).toBeNull();

    const [[, payload]] = stripeTaskCalls();
    await runTask(processStripeEvent, payload as StripeEventPayload);

    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledTimes(1);
    expect(stripeState.refunds).toHaveLength(1);
    // Mesmo event_id nas 2 tentativas (o Sentry deduplica); o alerta agora foi confirmado.
    expect(duplicateAlerts()).toHaveLength(2);
    expect(new Set(duplicateAlerts().map(([e]) => e.event_id)).size).toBe(1);
    expect(duplicateAlerts()[1][0]).toMatchObject({ extra: expect.objectContaining({ cancelled_subscription_ids: ["sub_2"], refunded_amount: 1000 }) });
    expect((await events())[0].alertedAt).toEqual(expect.any(Date));
  });

  it("quando a cobrança estornada pela limpeza também tem um estorno parcial anterior sem marca, então a assinatura mantida NÃO é cancelada", async () => {
    const user = await doublyChargedCustomer();
    await withStripeTasks(() => deliver(created("sub_2")));
    stripeState.refunds.unshift({ id: "re_manual", payment_intent: "pi_2", amount: 300, metadata: {} });
    putCharge({ id: "ch_2", customer: "cus_1", refunded: true });

    await withStripeTasks(() => deliver(stripeEvent("charge.refunded", { id: "ch_2", object: "charge", customer: "cus_1", refunded: true })));

    expect(stripeState.subscriptions.get("sub_1")!.status).toBe("active");
    expect(await userHasAccess(user.id)).toBe(true);
  });

  it("quando a cobrança da assinatura mantida é estornada por inteiro, então ela é cancelada (estorno comum)", async () => {
    const user = await doublyChargedCustomer();
    await withStripeTasks(() => deliver(created("sub_2")));
    stripeState.refunds.push({ id: "re_manual", payment_intent: "pi_1", amount: 1000, metadata: {} });
    putCharge({ id: "ch_1", customer: "cus_1", refunded: true });

    await withStripeTasks(() => deliver(stripeEvent("charge.refunded", { id: "ch_1", object: "charge", customer: "cus_1", refunded: true })));

    expect(stripeState.subscriptions.get("sub_1")!.status).toBe("canceled");
    expect(await userHasAccess(user.id)).toBe(false);
  });

  it("quando o cliente tem só 1 assinatura viva, então nada é cancelado nem estornado", async () => {
    const user = await createUser({ stripeCustomerId: "cus_1" });
    putSubscription({ id: "sub_1", customer: "cus_1", status: "active", latest_invoice: "in_1" });
    putSubscription({ id: "sub_old", customer: "cus_1", status: "canceled", created: unix(Date.now() - 86_400_000) });

    await withStripeTasks(() => deliver(created("sub_1")));

    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
    expect(duplicateAlerts()).toHaveLength(0);
    expect(await userHasAccess(user.id)).toBe(true);
  });
});
