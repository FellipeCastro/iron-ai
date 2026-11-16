import { auth } from "@clerk/nextjs/server";
import { describe, expect, it } from "vitest";
import { db, users } from "@/db";
import { createSubscribedUser, createUser } from "./helpers/factories";
import { clerkMock, signIn, stripeMock, triggerMock } from "./helpers/mocks";

// Sanidade da infraestrutura de testes: banco real, limpeza entre testes e dublês ligados.
describe("infra de integração", () => {
  it("grava e lê no banco real", async () => {
    const user = await createUser();
    expect(await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, user.id) })).toMatchObject({ id: user.id });
  });

  it("começa cada teste com o banco vazio", async () => {
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("cria usuário com assinatura", async () => {
    const { user, subscription } = await createSubscribedUser("past_due");
    expect(subscription?.userId).toBe(user.id);
  });

  it("simula Clerk, Stripe e Trigger", async () => {
    signIn("user_x");
    expect((await auth()).userId).toBe("user_x");
    expect(clerkMock.deleteUser).not.toHaveBeenCalled();
    const customer = await stripeMock.customers.create({}, { idempotencyKey: "k" });
    expect(await stripeMock.customers.create({}, { idempotencyKey: "k" })).toBe(customer);
    expect(triggerMock.trigger).not.toHaveBeenCalled();
  });
});
