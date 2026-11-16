import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deleteAccountAction, openBillingPortalAction } from "@/app/(app)/actions";
import { db, sessions, subscriptions, telegramLinks, users } from "@/db";
import { createExercise, createSession, createSet, createSubscription, createUser, linkTelegram } from "./helpers/factories";
import { clerkMock, clerkState, sentryMock, signIn, stripeMock, stripeState } from "./helpers/mocks";

const userExists = async (id: string) => Boolean(await db.query.users.findFirst({ where: eq(users.id, id) }));

/**
 * Usuário com cliente Stripe, assinatura, Telegram e um treino com série (de exercício do catálogo).
 * O caso do exercício personalizado tem teste próprio, porque hoje quebra a exclusão (tests/BUGS.md #4).
 */
async function populatedUser() {
  const user = await createUser({ stripeCustomerId: `cus_${Math.random().toString(36).slice(2, 8)}` });
  await createSubscription(user.id);
  await linkTelegram(user.id);
  const session = await createSession(user.id);
  const exercise = await createExercise();
  await createSet(session.id, exercise.id);
  return user;
}

const rowsOf = async (userId: string) => ({
  sessions: (await db.select().from(sessions).where(eq(sessions.userId, userId))).length,
  subscriptions: (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId))).length,
  telegram: (await db.select().from(telegramLinks).where(eq(telegramLinks.userId, userId))).length,
});

describe("openBillingPortalAction", () => {
  it("quando o usuário está logado, então devolve a URL do portal com return_url em /settings", async () => {
    const user = await createUser({ stripeCustomerId: "cus_portal" });
    signIn(user.clerkId);

    const result = await openBillingPortalAction();

    expect(result.ok).toBe(true);
    expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: "cus_portal", return_url: "http://localhost:3000/settings" });
    if (result.ok) expect(result.data.url).toContain("portal.stripe.test");
  });

  it("quando o Stripe falha, então retorna erro amigável", async () => {
    const user = await createUser({ stripeCustomerId: "cus_portal" });
    signIn(user.clerkId);
    stripeState.fail.set("billingPortal.sessions.create", new Error("stripe down"));

    expect(await openBillingPortalAction()).toEqual({ ok: false, error: "Não foi possível abrir o gerenciamento da assinatura. Tente de novo." });
    expect(sentryMock.captureException).toHaveBeenCalled();
  });
});

describe("deleteAccountAction", () => {
  it("quando tudo dá certo, então cancela o cliente no Stripe, apaga o usuário e todos os seus dados, e apaga o login na Clerk", async () => {
    const user = await populatedUser();
    signIn(user.clerkId);

    expect(await deleteAccountAction()).toEqual({ ok: true, data: undefined });

    expect(stripeMock.customers.del).toHaveBeenCalledWith(user.stripeCustomerId);
    expect(await userExists(user.id)).toBe(false);
    expect(await rowsOf(user.id)).toEqual({ sessions: 0, subscriptions: 0, telegram: 0 });
    expect(clerkMock.deleteUser).toHaveBeenCalledWith(user.clerkId);
  });

  // BUG CONHECIDO (tests/BUGS.md #4): users -> exercises cascateia, mas set_entries.exercise_id não, e o DELETE falha.
  it("quando o usuário tem exercício personalizado já usado em séries, então a conta é apagada por inteiro", async () => {
    const user = await populatedUser();
    const custom = await createExercise({ ownerUserId: user.id });
    const [session] = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    await createSet(session.id, custom.id, { setPosition: 2 });
    signIn(user.clerkId);

    expect(await deleteAccountAction()).toEqual({ ok: true, data: undefined });
    expect(await userExists(user.id)).toBe(false);
  });

  it("quando o Stripe falha, então NADA é apagado e o usuário pode tentar de novo", async () => {
    const user = await populatedUser();
    signIn(user.clerkId);
    stripeState.fail.set("customers.del", new Error("stripe down"));

    expect(await deleteAccountAction()).toEqual({ ok: false, error: "Não conseguimos cancelar sua assinatura. Tente de novo." });
    expect(await userExists(user.id)).toBe(true);
    expect(await rowsOf(user.id)).toEqual({ sessions: 1, subscriptions: 1, telegram: 1 });
    expect(clerkMock.deleteUser).not.toHaveBeenCalled();

    stripeState.fail.clear();
    expect(await deleteAccountAction()).toMatchObject({ ok: true });
    expect(await userExists(user.id)).toBe(false);
  });

  it("quando a Clerk falha depois de apagar os dados, então retorna erro avisando que o login ficou", async () => {
    const user = await populatedUser();
    signIn(user.clerkId);
    clerkState.deleteUserError = new Error("clerk down");

    expect(await deleteAccountAction()).toEqual({ ok: false, error: "Seus dados foram apagados, mas não conseguimos remover o login. Tente de novo." });
    expect(await userExists(user.id)).toBe(false);
    expect(sentryMock.captureException).toHaveBeenCalled();
  });

  it("quando o usuário A apaga a conta, então os dados do usuário B continuam intactos", async () => {
    const a = await populatedUser();
    const b = await populatedUser();
    signIn(a.clerkId);

    expect(await deleteAccountAction()).toEqual({ ok: true, data: undefined });

    expect(await userExists(a.id)).toBe(false);
    expect(await userExists(b.id)).toBe(true);
    expect(await rowsOf(b.id)).toEqual({ sessions: 1, subscriptions: 1, telegram: 1 });
    expect(stripeMock.customers.del).not.toHaveBeenCalledWith(b.stripeCustomerId);
  });

  it("quando 2 exclusões simultâneas disparam, então nenhuma dá erro 500 e os dados somem uma vez só", async () => {
    const user = await populatedUser();
    signIn(user.clerkId);

    const results = await Promise.allSettled([deleteAccountAction(), deleteAccountAction()]);

    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(await userExists(user.id)).toBe(false);
    expect(await rowsOf(user.id)).toEqual({ sessions: 0, subscriptions: 0, telegram: 0 });
  });
});
