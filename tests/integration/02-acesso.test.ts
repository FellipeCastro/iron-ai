import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  addSetAction,
  createTelegramLinkAction,
  deleteAccountAction,
  deleteExerciseFromSessionAction,
  deleteSessionAction,
  deleteSetAction,
  disconnectTelegramAction,
  openBillingPortalAction,
  saveRoutineAction,
  saveSettingsAction,
  startCheckoutAction,
  updateSessionDurationAction,
  updateSetAction,
} from "@/app/(app)/actions";
import { GET } from "@/app/assinar/sucesso/route";
import { db, sessions } from "@/db";
import { createSession, createSubscribedUser, createUser } from "./helpers/factories";
import { signIn, signOut, UnauthorizedError } from "./helpers/mocks";
import { request } from "./helpers/requests";

const BLOCKED = "Sua assinatura não está ativa. Assine para continuar.";
const UUID = "00000000-0000-4000-8000-000000000000";
const sessionExists = async (id: string) => Boolean(await db.query.sessions.findFirst({ where: eq(sessions.id, id) }));

/** Apaga uma sessão do próprio usuário: serve de sonda para "a action executou ou foi bloqueada". */
async function probe(status: string | null, opts: { complimentary?: boolean; currentPeriodEnd?: Date } = {}) {
  const { user } = await createSubscribedUser(null, { complimentary: opts.complimentary });
  if (status) {
    const { createSubscription } = await import("./helpers/factories");
    await createSubscription(user.id, { status, ...(opts.currentPeriodEnd && { currentPeriodEnd: opts.currentPeriodEnd }) });
  }
  const session = await createSession(user.id);
  signIn(user.clerkId);
  const result = await deleteSessionAction({ sessionId: session.id });
  return { result, gone: !(await sessionExists(session.id)) };
}

describe("actions protegidas por assinatura", () => {
  it("quando não há sessão Clerk, então a action é rejeitada (auth.protect)", async () => {
    signOut();
    await expect(deleteSessionAction({ sessionId: UUID })).rejects.toThrow(UnauthorizedError);
    await expect(saveRoutineAction([])).rejects.toThrow(UnauthorizedError);
  });

  it("quando o usuário não tem assinatura nem é complimentary, então retorna ok:false com 'Sua assinatura não está ativa' e nada é gravado", async () => {
    const { result, gone } = await probe(null);
    expect(result).toEqual({ ok: false, error: BLOCKED });
    expect(gone).toBe(false);
  });

  it("todas as 7 actions protegidas bloqueiam o usuário sem assinatura", async () => {
    const user = await createUser();
    signIn(user.clerkId);
    const results = await Promise.all([
      saveRoutineAction([{ title: "A", exercises: [] }]),
      updateSetAction({ setId: UUID, weight: 10, reps: 5 }),
      deleteSetAction({ setId: UUID }),
      addSetAction({ sessionId: UUID, exerciseId: UUID, weight: 10, reps: 5 }),
      deleteSessionAction({ sessionId: UUID }),
      updateSessionDurationAction({ sessionId: UUID, minutes: 30 }),
      deleteExerciseFromSessionAction({ sessionId: UUID, exerciseId: UUID }),
    ]);
    for (const r of results) expect(r).toEqual({ ok: false, error: BLOCKED });
  });

  it.each(["active", "trialing"])("quando o status é %s, então a action executa", async (status) => {
    const { result, gone } = await probe(status);
    expect(result.ok).toBe(true);
    expect(gone).toBe(true);
  });

  it("quando o status é past_due, então a action executa", async () => {
    const { result, gone } = await probe("past_due");
    expect(result.ok).toBe(true);
    expect(gone).toBe(true);
  });

  it.each(["canceled", "unpaid", "incomplete", "incomplete_expired"])("quando o status é %s, então é bloqueado", async (status) => {
    const { result, gone } = await probe(status);
    expect(result).toEqual({ ok: false, error: BLOCKED });
    expect(gone).toBe(false);
  });

  it("quando a conta é complimentary sem assinatura, então tem acesso", async () => {
    const { result, gone } = await probe(null, { complimentary: true });
    expect(result.ok).toBe(true);
    expect(gone).toBe(true);
  });

  // BUG CONHECIDO (tests/BUGS.md #2): `hasAccess` só olha o status e ignora current_period_end.
  it("quando a assinatura está active mas current_period_end já passou, então o acesso é totalmente removido", async () => {
    const { result, gone } = await probe("active", { currentPeriodEnd: new Date(Date.now() - 86_400_000) });
    expect(result).toEqual({ ok: false, error: BLOCKED });
    expect(gone).toBe(false);
  });
});

describe("actions liberadas sem assinatura", () => {
  it("quando o usuário está sem assinatura, então consegue usar essas actions", async () => {
    const user = await createUser({ stripeCustomerId: null });
    signIn(user.clerkId);

    expect(await saveSettingsAction({ timezone: "America/Sao_Paulo", reminderTime: "", trainingDays: [1], weightIncrementKg: 2.5 })).toMatchObject({ ok: true });
    expect(await createTelegramLinkAction()).toMatchObject({ ok: true });
    expect(await disconnectTelegramAction()).toMatchObject({ ok: true });
    expect(await startCheckoutAction({ plan: "monthly" })).toMatchObject({ ok: true });
    expect(await openBillingPortalAction()).toMatchObject({ ok: true });
    expect(await deleteAccountAction()).toMatchObject({ ok: true });
  });
});

describe("GET /assinar/sucesso", () => {
  it("quando não há sessão, então redireciona para o login", async () => {
    signOut();
    const res = await GET(request("/assinar/sucesso"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/sign-in");
  });
});
