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
import { createSession, createSubscribedUser, createSubscription, createUser } from "./helpers/factories";
import { signIn, signOut, UnauthorizedError } from "./helpers/mocks";
import { request } from "./helpers/requests";

const BLOCKED = "Sua assinatura não está ativa. Assine para continuar.";
const UUID = "00000000-0000-4000-8000-000000000000";
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const sessionExists = async (id: string) => Boolean(await db.query.sessions.findFirst({ where: eq(sessions.id, id) }));

/** Apaga uma sessão do próprio usuário: serve de sonda para "a action executou ou foi bloqueada". */
type ProbeOpts = { complimentary?: boolean; currentPeriodStart?: Date | null; currentPeriodEnd?: Date; updatedAt?: Date };
async function probe(status: string | null, opts: ProbeOpts = {}) {
  const { user } = await createSubscribedUser(null, { complimentary: opts.complimentary });
  if (status) {
    const { currentPeriodStart, currentPeriodEnd, updatedAt } = opts;
    const sub = await createSubscription(user.id, {
      status,
      ...(currentPeriodStart !== undefined && { currentPeriodStart }),
      ...(currentPeriodEnd && { currentPeriodEnd }),
      ...(updatedAt && { updatedAt }),
    });
    // `updatedAt` tem $onUpdate, mas no insert o valor passado vale; confere para o teste não passar por acaso.
    if (opts.updatedAt) expect(sub.updatedAt.getTime()).toBe(opts.updatedAt.getTime());
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

  describe("past_due: 7 dias de carência contados do início do período não pago", () => {
    // Na renovação o Stripe avança o período antes de cobrar: o current_period_end de um past_due é o fim de um
    // período que ninguém pagou, então a carência conta de current_period_start.
    it("quando a renovação falhou há 1 dia, então a action executa", async () => {
      const { result, gone } = await probe("past_due", { currentPeriodStart: daysAgo(1), currentPeriodEnd: new Date(Date.now() + 29 * DAY) });
      expect(result.ok).toBe(true);
      expect(gone).toBe(true);
    });

    it("quando a renovação falhou há 6 dias, então a action ainda executa", async () => {
      const { result, gone } = await probe("past_due", { currentPeriodStart: daysAgo(6), currentPeriodEnd: new Date(Date.now() + 24 * DAY) });
      expect(result.ok).toBe(true);
      expect(gone).toBe(true);
    });

    it("quando a renovação falhou há 8 dias, então é bloqueado mesmo com current_period_end no futuro", async () => {
      const { result, gone } = await probe("past_due", { currentPeriodStart: daysAgo(8), currentPeriodEnd: new Date(Date.now() + 22 * DAY) });
      expect(result).toEqual({ ok: false, error: BLOCKED });
      expect(gone).toBe(false);
    });

    it("quando é plano anual (current_period_end daqui a ~1 ano) e a renovação falhou há 8 dias, então é bloqueado", async () => {
      const { result, gone } = await probe("past_due", { currentPeriodStart: daysAgo(8), currentPeriodEnd: new Date(Date.now() + 357 * DAY) });
      expect(result).toEqual({ ok: false, error: BLOCKED });
      expect(gone).toBe(false);
    });

    it("quando a linha é antiga (sem current_period_start) e foi sincronizada há 2 dias, então usa updated_at e executa", async () => {
      const { result, gone } = await probe("past_due", { currentPeriodStart: null, updatedAt: daysAgo(2) });
      expect(result.ok).toBe(true);
      expect(gone).toBe(true);
    });

    it("quando a linha é antiga (sem current_period_start) e foi sincronizada há 8 dias, então é bloqueado", async () => {
      const { result, gone } = await probe("past_due", { currentPeriodStart: null, updatedAt: daysAgo(8) });
      expect(result).toEqual({ ok: false, error: BLOCKED });
      expect(gone).toBe(false);
    });
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
    const { result, gone } = await probe("active", { currentPeriodEnd: daysAgo(1) });
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
