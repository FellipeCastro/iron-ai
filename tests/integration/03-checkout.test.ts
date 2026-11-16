import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { startCheckoutAction } from "@/app/(app)/actions";
import { GET } from "@/app/assinar/sucesso/route";
import { db, subscriptions, users } from "@/db";
import { createSubscribedUser, createUser } from "./helpers/factories";
import { putSubscription, sentryMock, signIn, stripeMock, stripeState } from "./helpers/mocks";
import { request } from "./helpers/requests";

const subs = () => db.select().from(subscriptions);
const customerOf = async (id: string) => (await db.query.users.findFirst({ where: eq(users.id, id) }))!.stripeCustomerId;
const noStripeCalls = () => {
  expect(stripeMock.customers.create).not.toHaveBeenCalled();
  expect(stripeMock.subscriptions.list).not.toHaveBeenCalled();
  expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
};

describe("startCheckoutAction", () => {
  it.each([
    ["monthly", "STRIPE_PRICE_MONTHLY"],
    ["annual", "STRIPE_PRICE_ANNUAL"],
  ] as const)("quando o plano é %s e o usuário não tem assinatura, então devolve a URL do Checkout com o price do plano, client_reference_id e o customer salvo", async (plan, priceEnv) => {
    const user = await createUser();
    signIn(user.clerkId);

    const result = await startCheckoutAction({ plan });

    expect(result).toMatchObject({ ok: true, data: { url: expect.stringContaining("checkout.stripe.test") } });
    const saved = await customerOf(user.id);
    expect(saved).toBeTruthy();
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: saved,
        client_reference_id: user.id,
        line_items: [{ price: process.env[priceEnv], quantity: 1 }],
      }),
    );
  });

  it.each([{ plan: "weekly" }, { plan: "" }, {}])("quando o plano é inválido (%j), então retorna 'Plano inválido.' e não chama o Stripe", async (input) => {
    const user = await createUser();
    signIn(user.clerkId);
    expect(await startCheckoutAction(input as never)).toEqual({ ok: false, error: "Plano inválido." });
    noStripeCalls();
  });

  it("quando o Stripe falha, então retorna mensagem de erro amigável, não grava assinatura e não lança exceção", async () => {
    const user = await createUser();
    signIn(user.clerkId);
    stripeState.fail.set("checkout.sessions.create", new Error("stripe down"));

    const result = await startCheckoutAction({ plan: "monthly" });

    expect(result).toEqual({ ok: false, error: "Não foi possível abrir o pagamento. Tente de novo." });
    expect(await subs()).toHaveLength(0);
    expect(sentryMock.captureException).toHaveBeenCalled();
  });

  it("quando o usuário já tem acesso, então devolve a URL do dashboard e NÃO cria outro Checkout", async () => {
    const { user } = await createSubscribedUser("active");
    signIn(user.clerkId);
    const result = await startCheckoutAction({ plan: "monthly" });
    expect(result).toEqual({ ok: true, data: { url: "http://localhost:3000/dashboard" } });
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("quando o usuário pagou mas o webhook ainda não chegou (Stripe lista assinatura ativa), então sincroniza a assinatura e devolve o dashboard em vez de cobrar de novo", async () => {
    const user = await createUser({ stripeCustomerId: "cus_paid" });
    putSubscription({ id: "sub_paid", customer: "cus_paid", status: "active" });
    signIn(user.clerkId);

    const result = await startCheckoutAction({ plan: "monthly" });

    expect(result).toEqual({ ok: true, data: { url: "http://localhost:3000/dashboard" } });
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    expect(await subs()).toMatchObject([{ userId: user.id, stripeSubscriptionId: "sub_paid", status: "active" }]);
  });

  it("quando o usuário não tinha cliente Stripe, então cria 1 cliente e salva o id antes de abrir o Checkout", async () => {
    const user = await createUser();
    signIn(user.clerkId);
    // No momento em que o Checkout é criado, o customer já tem de estar salvo no banco.
    let savedWhenCheckoutCreated: string | null | undefined;
    stripeMock.checkout.sessions.create.mockImplementationOnce(async (params: { customer?: string }) => {
      savedWhenCheckoutCreated = await customerOf(user.id);
      return { id: "cs_test_x", url: "https://checkout.stripe.test/cs_test_x", customer: params.customer };
    });

    await startCheckoutAction({ plan: "monthly" });

    expect(stripeMock.customers.create).toHaveBeenCalledTimes(1);
    expect(savedWhenCheckoutCreated).toBe([...stripeState.customers.keys()][0]);
  });

  it("quando o usuário clica 2 vezes em 'assinar' ao mesmo tempo, então só existe 1 cliente Stripe e 1 stripeCustomerId", async () => {
    const user = await createUser();
    signIn(user.clerkId);

    await Promise.all([startCheckoutAction({ plan: "monthly" }), startCheckoutAction({ plan: "monthly" })]);

    expect(stripeState.customers.size).toBe(1);
    expect(await customerOf(user.id)).toBe([...stripeState.customers.keys()][0]);
  });

  // BUG CONHECIDO (tests/BUGS.md #3): a Checkout Session é criada sem idempotency key.
  it("quando o usuário clica 2 vezes ao mesmo tempo, então só 1 Checkout Session é criada", async () => {
    const user = await createUser();
    signIn(user.clerkId);

    const results = await Promise.all([startCheckoutAction({ plan: "monthly" }), startCheckoutAction({ plan: "monthly" })]);

    expect(results.every((r) => r.ok)).toBe(true);
    const urls = results.map((r) => (r.ok ? r.data.url : null));
    expect(urls.every((u) => typeof u === "string" && u.includes("checkout.stripe.test"))).toBe(true);
    expect(new Set(urls).size).toBe(1);
  });
});

describe("GET /assinar/sucesso?session_id=", () => {
  const checkoutSession = (customer: string, subscription: string | null) =>
    stripeMock.checkout.sessions.retrieve.mockResolvedValueOnce({ id: "cs_1", customer, subscription } as never);
  const location = (res: Response) => new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search;

  it("quando o session_id é do cliente do próprio usuário, então sincroniza a assinatura e redireciona para o dashboard", async () => {
    const user = await createUser({ stripeCustomerId: "cus_me" });
    putSubscription({ id: "sub_me", customer: "cus_me", status: "active" });
    checkoutSession("cus_me", "sub_me");
    signIn(user.clerkId);

    const res = await GET(request("/assinar/sucesso?session_id=cs_1"));

    expect(location(res)).toBe("/dashboard");
    expect(await subs()).toMatchObject([{ userId: user.id, stripeSubscriptionId: "sub_me", status: "active" }]);
  });

  it("quando o session_id pertence ao cliente de OUTRO usuário, então NÃO sincroniza nada e o acesso do usuário não muda", async () => {
    const user = await createUser({ stripeCustomerId: "cus_mine" });
    await createUser({ stripeCustomerId: "cus_other" });
    putSubscription({ id: "sub_other", customer: "cus_other", status: "active" });
    checkoutSession("cus_other", "sub_other");
    signIn(user.clerkId);

    const res = await GET(request("/assinar/sucesso?session_id=cs_1"));

    expect(location(res)).toBe("/settings?checkout=success");
    expect(await subs()).toHaveLength(0);
  });

  it.each(["/assinar/sucesso", "/assinar/sucesso?session_id=sub_123", "/assinar/sucesso?session_id="])("quando o session_id não começa com 'cs_' ou falta (%s), então não chama o Stripe", async (path) => {
    const user = await createUser();
    signIn(user.clerkId);
    await GET(request(path));
    expect(stripeMock.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });

  it("quando o Stripe falha, então redireciona para /settings?checkout=success sem derrubar a rota", async () => {
    const user = await createUser({ stripeCustomerId: "cus_me" });
    signIn(user.clerkId);
    stripeState.fail.set("checkout.sessions.retrieve", new Error("stripe down"));

    const res = await GET(request("/assinar/sucesso?session_id=cs_1"));

    expect(location(res)).toBe("/settings?checkout=success");
    expect(sentryMock.captureException).toHaveBeenCalled();
  });

  it("quando o webhook ainda não ativou a assinatura, então redireciona para /settings?checkout=success", async () => {
    const user = await createUser({ stripeCustomerId: "cus_me" });
    checkoutSession("cus_me", null);
    signIn(user.clerkId);

    const res = await GET(request("/assinar/sucesso?session_id=cs_1"));

    expect(location(res)).toBe("/settings?checkout=success");
  });
});
