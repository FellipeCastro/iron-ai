import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, sessions, subscriptions, telegramLinks, users } from "@/db";
import { POST } from "@/app/api/webhooks/clerk/route";
import { ensureUser } from "@/lib/services/users";
import { clerkUserCreated, clerkUserDeleted, clerkUserUpdated } from "@/trigger/clerk-users";
import { createExercise, createSession, createSet, createSubscription, createUser, linkTelegram } from "./helpers/factories";
import { stripeMock, stripeState, triggerMock } from "./helpers/mocks";
import { clerkWebhookRequest } from "./helpers/requests";
import { runTask } from "./helpers/tasks";

const userCount = async () => (await db.select().from(users)).length;

describe("POST /api/webhooks/clerk", () => {
  it("quando a assinatura svix é inválida, então responde 400 e não enfileira nada", async () => {
    const res = await POST(clerkWebhookRequest({ type: "user.created", data: { id: "user_abc" } }, { tamper: true }));
    expect(res.status).toBe(400);
    expect(triggerMock.trigger).not.toHaveBeenCalled();
  });

  it("quando chega user.created válido, então enfileira 1 tarefa com a chave de idempotência do svix-id e responde 200", async () => {
    const res = await POST(clerkWebhookRequest({ type: "user.created", data: { id: "user_abc" } }, { svixId: "msg_1" }));
    expect(res.status).toBe(200);
    expect(triggerMock.trigger).toHaveBeenCalledTimes(1);
    expect(triggerMock.trigger).toHaveBeenCalledWith(
      "clerk-user-created",
      { clerkId: "user_abc" },
      expect.objectContaining({ idempotencyKey: "idem:global:msg_1", concurrencyKey: "user_abc" }),
    );
  });

  it("quando o mesmo svix-id chega duas vezes, então a segunda entrega usa a mesma idempotencyKey", async () => {
    const event = { type: "user.created", data: { id: "user_abc" } };
    await POST(clerkWebhookRequest(event, { svixId: "msg_same" }));
    await POST(clerkWebhookRequest(event, { svixId: "msg_same" }));
    const keys = triggerMock.trigger.mock.calls.map((c) => (c[2] as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("quando o evento não traz id de usuário, então responde 200 sem enfileirar", async () => {
    const res = await POST(clerkWebhookRequest({ type: "user.created", data: {} }));
    expect(res.status).toBe(200);
    expect(triggerMock.trigger).not.toHaveBeenCalled();
  });
});

describe("tarefas clerk-user-created/updated/deleted (rodam no banco real)", () => {
  it("quando user.created roda duas vezes para o mesmo clerkId, então existe 1 só usuário", async () => {
    await runTask(clerkUserCreated, { clerkId: "user_dup" });
    await runTask(clerkUserCreated, { clerkId: "user_dup" });
    expect(await userCount()).toBe(1);
  });

  it("quando user.updated chega antes de user.created, então o usuário é criado (backfill)", async () => {
    await runTask(clerkUserUpdated, { clerkId: "user_early" });
    expect(await db.query.users.findFirst({ where: eq(users.clerkId, "user_early") })).toBeDefined();
    await runTask(clerkUserCreated, { clerkId: "user_early" });
    expect(await userCount()).toBe(1);
  });

  it("quando user.deleted roda, então apaga o usuário e tudo que depende dele (assinatura, treinos, vínculo Telegram)", async () => {
    const user = await createUser();
    const other = await createUser();
    await createSubscription(user.id);
    await createSubscription(other.id);
    await linkTelegram(user.id);
    await createSession(user.id);
    await createSession(other.id);

    await runTask(clerkUserDeleted, { clerkId: user.clerkId });

    expect(await db.query.users.findFirst({ where: eq(users.id, user.id) })).toBeUndefined();
    expect(await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id))).toHaveLength(0);
    expect(await db.select().from(telegramLinks).where(eq(telegramLinks.userId, user.id))).toHaveLength(0);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
    // O outro usuário continua intacto.
    expect(await db.select().from(sessions).where(eq(sessions.userId, other.id))).toHaveLength(1);
    expect(await db.select().from(subscriptions).where(eq(subscriptions.userId, other.id))).toHaveLength(1);
  });

  // BUG CONHECIDO (tests/BUGS.md #4): o exercício personalizado cascateia de users, mas set_entries.exercise_id não.
  it("quando o usuário tem exercício personalizado já usado em séries, então user.deleted apaga tudo", async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    const custom = await createExercise({ ownerUserId: user.id });
    await createSet(session.id, custom.id);

    await runTask(clerkUserDeleted, { clerkId: user.clerkId });

    expect(await db.query.users.findFirst({ where: eq(users.id, user.id) })).toBeUndefined();
  });

  // BUG CONHECIDO (tests/BUGS.md #1): a tarefa só apaga o usuário, não cancela o cliente no Stripe.
  it("quando user.deleted roda, então o cliente Stripe dele é cancelado", async () => {
    const user = await createUser({ stripeCustomerId: "cus_to_cancel" });
    await runTask(clerkUserDeleted, { clerkId: user.clerkId });
    expect(stripeMock.customers.del).toHaveBeenCalledWith("cus_to_cancel");
  });
});

describe("clerk-user-deleted — falhas do Stripe", () => {
  it("quando o Stripe falha, então a tarefa lança erro (retry) e o usuário continua no banco", async () => {
    const user = await createUser({ stripeCustomerId: "cus_x" });
    stripeState.fail.set("customers.del", new Error("stripe down"));

    await expect(runTask(clerkUserDeleted, { clerkId: user.clerkId })).rejects.toThrow("stripe down");
    expect(await db.query.users.findFirst({ where: eq(users.id, user.id) })).toBeDefined();

    stripeState.fail.clear();
    await runTask(clerkUserDeleted, { clerkId: user.clerkId });
    expect(await db.query.users.findFirst({ where: eq(users.id, user.id) })).toBeUndefined();
  });

  it("quando o cliente já não existe no Stripe (retry de uma execução parcial), então o usuário é apagado mesmo assim", async () => {
    const user = await createUser({ stripeCustomerId: "cus_gone" });
    stripeState.fail.set("customers.del", Object.assign(new Error("No such customer"), { code: "resource_missing" }));

    expect(await runTask(clerkUserDeleted, { clerkId: user.clerkId })).toEqual({ deleted: true });
    expect(await db.query.users.findFirst({ where: eq(users.id, user.id) })).toBeUndefined();
  });

  it("quando o usuário não tem cliente Stripe, então não chama o Stripe", async () => {
    const user = await createUser();
    await runTask(clerkUserDeleted, { clerkId: user.clerkId });
    expect(stripeMock.customers.del).not.toHaveBeenCalled();
  });

  it("quando o usuário não existe, então não faz nada", async () => {
    expect(await runTask(clerkUserDeleted, { clerkId: "user_ghost" })).toEqual({ deleted: false });
    expect(stripeMock.customers.del).not.toHaveBeenCalled();
  });
});

describe("ensureUser", () => {
  it("quando o webhook ainda não chegou, então cria o usuário na hora", async () => {
    const user = await ensureUser("user_new");
    expect(user.clerkId).toBe("user_new");
    expect(await userCount()).toBe(1);
  });

  it("quando 2 requisições simultâneas pedem o mesmo clerkId novo, então só 1 usuário é criado e ambas recebem o mesmo id", async () => {
    const [a, b] = await Promise.all([ensureUser("user_race"), ensureUser("user_race")]);
    expect(a.id).toBe(b.id);
    expect(await userCount()).toBe(1);
  });
});
