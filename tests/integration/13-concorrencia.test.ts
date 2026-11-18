import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startCheckoutAction } from "@/app/(app)/actions";
import { POST } from "@/app/api/telegram/webhook/route";
import { aiUsage, aiUsageUser, db, exercises, messages, sessions, setEntries, subscriptions, telegramLinks, usageCounters, users } from "@/db";
import { handleUpdate } from "@/lib/bot/handle-update";
import { reserveAiBudget, reserveFallback, UserBudgetExceededError } from "@/lib/limits";
import { syncSubscription } from "@/lib/services/billing";
import { addSetToSession, deleteSetById, editSetById } from "@/lib/services/workout";
import { renameExerciseForUser } from "@/lib/services/routine";
import { createLinkToken } from "@/lib/services/users";
import * as render from "@/lib/telegram/render";
import { closeInactiveSession } from "@/trigger/close-session";
import { closeIdleSessions } from "@/trigger/tick";
import { createExercise, createSession, createSet, createSubscribedUser, createSubscription, createUser, linkTelegram } from "./helpers/factories";
import { openaiParse, openaiState, putSubscription, signIn, stripeMock, stripeState, telegramTexts, triggerMock } from "./helpers/mocks";
import { telegramTextUpdate, telegramWebhookRequest } from "./helpers/requests";

// Cada teste dispara 2 requisições iguais ao mesmo tempo e prova que só uma tem efeito.
// A proteção está no banco (unique, UPDATE condicional, lock de linha), não no front.

afterEach(() => vi.unstubAllEnvs());

const handle = (update: ReturnType<typeof telegramTextUpdate>) => handleUpdate(update as never, { isLastAttempt: true, log: vi.fn(), report: vi.fn() });

describe("#6 vincular o mesmo chat a 2 usuários ao mesmo tempo", () => {
  it("quando 2 usuários usam tokens diferentes para o mesmo chat, então só 1 vincula, o outro recebe 'chat ocupado' e ninguém recebe erro", async () => {
    const a = await createUser();
    const b = await createUser();
    const [tokenA, tokenB] = await Promise.all([createLinkToken(a.id), createLinkToken(b.id)]);

    const results = await Promise.allSettled([handle(telegramTextUpdate(999, `/start ${tokenA}`)), handle(telegramTextUpdate(999, `/start ${tokenB}`))]);

    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    const values = results.map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof handle>>>).value);
    expect(values.filter((r) => r.linkError === "chat_taken")).toHaveLength(1);
    expect(await db.select().from(telegramLinks).where(eq(telegramLinks.chatId, 999))).toHaveLength(1);
  });
});

describe("#7 ensureCustomer não sobrescreve o cliente Stripe salvo", () => {
  it("quando 2 cliques criam clientes diferentes (idempotency key expirada), então o primeiro salvo vence e os 2 Checkouts usam o MESMO cliente", async () => {
    const user = await createUser();
    signIn(user.clerkId);
    // Sem convergência pela idempotency key do Stripe: cada chamada cria um cliente novo.
    const fresh = async (params: { email?: string }) => {
      const customer = { id: `cus_${++stripeState.seq}`, email: params.email };
      stripeState.customers.set(customer.id, customer);
      return customer;
    };
    stripeMock.customers.create.mockImplementationOnce(fresh).mockImplementationOnce(fresh);

    await Promise.all([startCheckoutAction({ plan: "monthly" }), startCheckoutAction({ plan: "monthly" })]);

    const saved = (await db.query.users.findFirst({ where: eq(users.id, user.id) }))!.stripeCustomerId;
    expect(saved).toBeTruthy();
    const used = stripeMock.checkout.sessions.create.mock.calls.map((c) => (c[0] as { customer: string }).customer);
    expect(used.length).toBeGreaterThan(0);
    expect(new Set(used)).toEqual(new Set([saved]));
  });
});

describe("#8 redelivery do Telegram não consome a cota", () => {
  const counter = async (userId: string) => (await db.select().from(usageCounters).where(eq(usageCounters.userId, userId)))[0]?.count ?? 0;

  it("quando o mesmo update_id chega 2 vezes ao mesmo tempo, então conta 1 só e existe 1 linha em messages", async () => {
    const user = await createUser();
    await linkTelegram(user.id, 42);
    const msg = telegramTextUpdate(42, "supino 80x8");

    await Promise.all([POST(telegramWebhookRequest(msg)), POST(telegramWebhookRequest(msg))]);

    expect(await counter(user.id)).toBe(1);
    expect(await db.select().from(messages).where(eq(messages.updateId, msg.update_id))).toHaveLength(1);
  });

  it("quando uma mensagem barrada pelo limite é reentregue, então não é enfileirada nem contada de novo", async () => {
    vi.stubEnv("DAILY_MESSAGE_LIMIT", "1");
    const user = await createUser();
    await linkTelegram(user.id, 42);
    await POST(telegramWebhookRequest(telegramTextUpdate(42, "primeira")));
    const blocked = telegramTextUpdate(42, "segunda");
    await POST(telegramWebhookRequest(blocked));
    expect(triggerMock.trigger).toHaveBeenCalledTimes(1);

    await POST(telegramWebhookRequest(blocked));

    expect(triggerMock.trigger).toHaveBeenCalledTimes(1);
    expect(await counter(user.id)).toBe(2);
  });
});

describe("#10 apagar a última série x adicionar série ao mesmo tempo", () => {
  it("quando as duas chegam juntas, então a sessão nunca some se a série nova foi gravada", async () => {
    for (let i = 0; i < 5; i++) {
      const { user } = await createSubscribedUser("active");
      const exercise = await createExercise();
      const session = await createSession(user.id);
      const set = await createSet(session.id, exercise.id);

      const [del, add] = await Promise.allSettled([
        deleteSetById(user, set.id),
        addSetToSession(user, session.id, { exerciseId: exercise.id, weight: 90, reps: 5 }),
      ]);

      expect(del.status).toBe("fulfilled");
      // Se o add terminou com sucesso, a série dele existe e a sessão também (nunca uma série órfã ou sessão apagada).
      if (add.status === "fulfilled" && add.value === true) {
        const left = await db.select().from(sessions).where(eq(sessions.id, session.id));
        expect(left).toHaveLength(1);
        const valid = (await db.select().from(setEntries).where(eq(setEntries.sessionId, session.id))).filter((s) => !s.voidedAt);
        expect(valid).toHaveLength(1);
        expect(valid[0].weight).toBe(90);
      }
    }
  });
});

describe("#11 renomear exercício ao mesmo tempo", () => {
  it("quando 2 exercícios do usuário são renomeados para o mesmo nome juntos, então não dá erro e existe 1 só com esse nome", async () => {
    const user = await createUser();
    const a = await createExercise({ ownerUserId: user.id, name: "Rosca A" });
    const b = await createExercise({ ownerUserId: user.id, name: "Rosca B" });

    const results = await Promise.allSettled([renameExerciseForUser(user.id, a.id, "Rosca nova"), renameExerciseForUser(user.id, b.id, "Rosca nova")]);

    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    const named = await db.select().from(exercises).where(eq(exercises.ownerUserId, user.id));
    expect(named.filter((e) => e.name === "Rosca nova")).toHaveLength(1);
  });
});

describe("#1 corrigir a mesma série ao mesmo tempo", () => {
  it("quando 2 correções da mesma série chegam juntas, então só uma vale: 1 série válida, a original anulada, e a perdedora recebe null", async () => {
    const { user } = await createSubscribedUser("active");
    const exercise = await createExercise();
    const session = await createSession(user.id);
    const set = await createSet(session.id, exercise.id, { weight: 80, reps: 8 });

    const results = await Promise.all([editSetById(user, set.id, { weight: 85, reps: 6 }), editSetById(user, set.id, { weight: 90, reps: 5 })]);

    expect(results.filter((r) => r !== null)).toHaveLength(1);
    const rows = await db.select().from(setEntries).where(eq(setEntries.sessionId, session.id));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === set.id)!.voidedAt).not.toBeNull();
    const valid = rows.filter((r) => !r.voidedAt);
    expect(valid).toHaveLength(1);
    expect(valid[0]).toMatchObject({ supersedesId: set.id, setPosition: set.setPosition });
  });

  it("quando a série já foi apagada e alguém tenta corrigi-la, então nada é recriado", async () => {
    const { user } = await createSubscribedUser("active");
    const exercise = await createExercise();
    const session = await createSession(user.id);
    const set = await createSet(session.id, exercise.id, { voidedAt: new Date() });

    expect(await editSetById(user, set.id, { weight: 85, reps: 6 })).toBeNull();

    expect(await db.select().from(setEntries).where(eq(setEntries.sessionId, session.id))).toHaveLength(1);
  });
});

describe("#2 retry do mesmo update do Telegram não duplica séries", () => {
  type Update = ReturnType<typeof telegramTextUpdate>;
  const logIntent = { intent: { type: "log_sets", groups: [{ exercise: "supino", exercise_named: true, weight_kg: 80, reps: 8, sets: 3 }] }, confidence: 1 };
  const setsOf = (userId: string) =>
    db.select({ set: setEntries }).from(setEntries).innerJoin(sessions, eq(sessions.id, setEntries.sessionId)).where(eq(sessions.userId, userId));

  async function setup() {
    vi.stubEnv("FAST_PATH", "off");
    const { user } = await createSubscribedUser("active");
    await linkTelegram(user.id, 10);
    await createExercise({ name: "Supino reto", aliases: ["supino"] });
    openaiState.parsed = logIntent;
    return user;
  }

  it("quando a task falha depois de gravar (linha de messages ainda 'received') e roda de novo, então continuam 3 séries", async () => {
    const user = await setup();
    const update: Update = telegramTextUpdate(10, "supino 80x8 3 séries");
    await handle(update);
    // Como se a primeira tentativa tivesse caído antes do `finish`: o retry encontra o update em "received".
    await db.update(messages).set({ status: "received" }).where(eq(messages.updateId, update.update_id));

    await handle(update);

    expect(await setsOf(user.id)).toHaveLength(3);
    expect(telegramTexts().at(-1)).toBe(render.alreadyLogged());
  });

  it("quando o mesmo update roda 2 vezes ao mesmo tempo, então o banco não aceita as séries em dobro", async () => {
    const user = await setup();
    const update: Update = telegramTextUpdate(10, "supino 80x8 3 séries");

    await Promise.allSettled([handle(update), handle(update)]);

    const sets = (await setsOf(user.id)).map((r) => r.set);
    expect(sets).toHaveLength(3);
    expect(new Set(sets.map((s) => `${s.sourceUpdateId}:${s.sourceIdx}`)).size).toBe(3);
  });

  it("quando updates diferentes registram séries, então cada um grava as suas (a chave é por update)", async () => {
    const user = await setup();

    await handle(telegramTextUpdate(10, "supino 80x8 3 séries"));
    await handle(telegramTextUpdate(10, "supino 80x8 3 séries"));

    expect(await setsOf(user.id)).toHaveLength(6);
  });
});

describe("#4 orçamento de IA reservado antes da chamada", () => {
  const today = () => new Date().toISOString().slice(0, 10);
  const globalRow = async () => (await db.select().from(aiUsage).where(eq(aiUsage.date, today())))[0];
  const userRow = async (userId: string) => (await db.select().from(aiUsageUser).where(eq(aiUsageUser.userId, userId)))[0];
  const logIntent = { intent: { type: "log_sets", groups: [{ exercise: "supino", exercise_named: true, weight_kg: 80, reps: 8, sets: 1 }] }, confidence: 1 };

  async function linkedUser(chatId: number) {
    const { user } = await createSubscribedUser("active");
    await linkTelegram(user.id, chatId);
    return user;
  }

  it("quando 5 usuários mandam mensagem juntos e só cabe 1 chamada no orçamento global, então só 1 chega ao OpenAI", async () => {
    vi.stubEnv("FAST_PATH", "off");
    await createExercise({ name: "Supino reto", aliases: ["supino"] });
    for (let i = 1; i <= 5; i++) await linkedUser(100 + i);
    openaiState.parsed = logIntent;
    // A chamada demora e custa de verdade (US$ 0,003 com esses tokens), como a real: o gasto fecha o teto de vez.
    openaiParse.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 300));
      return { output_parsed: openaiState.parsed, usage: { input_tokens: 1000, output_tokens: 500 } };
    });
    // Falta 0,001 para o teto de US$ 5: a primeira reserva passa, as outras já encontram o teto atingido.
    await db.insert(aiUsage).values({ date: today(), requests: 100, costUsd: 4.999 });

    const results = await Promise.all([101, 102, 103, 104, 105].map((chat) => handle(telegramTextUpdate(chat, "supino 80x8"))));

    expect(openaiParse).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.status === "processed")).toHaveLength(1);
    expect(results.filter((r) => r.status === "failed")).toHaveLength(4);
    // A estimativa (0,003) foi trocada pelo custo real (0,003): o gasto do dia é só o que foi de fato gasto.
    expect((await globalRow()).costUsd).toBeCloseTo(5.002, 4);
    expect((await globalRow()).requests).toBe(101);
  });

  it("quando a chamada ao OpenAI falha, então a reserva é devolvida e o gasto não muda", async () => {
    vi.stubEnv("FAST_PATH", "off");
    const user = await linkedUser(10);
    openaiState.error = new Error("boom");

    const result = await handle(telegramTextUpdate(10, "supino 80x8"));

    expect(result.status).toBe("failed");
    expect((await globalRow()).costUsd).toBe(0);
    expect((await userRow(user.id)).costUsd).toBe(0);
  });

  it("quando 3 reservas do mesmo usuário chegam juntas e só cabe 1 no teto dele, então 1 passa, 2 recebem UserBudgetExceededError e o global só guarda a que passou", async () => {
    const user = await linkedUser(10);
    await db.insert(aiUsageUser).values({ userId: user.id, date: today(), requests: 50, costUsd: 0.2495 });

    const results = await Promise.allSettled([0, 1, 2].map(() => reserveAiBudget(user.id, 0.003)));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(2);
    expect(rejected.every((r) => r.reason instanceof UserBudgetExceededError)).toBe(true);
    expect((await userRow(user.id)).costUsd).toBeCloseTo(0.2525, 4);
    // As 2 reservas que o teto do usuário barrou devolveram o que tinham tomado do global.
    expect((await globalRow()).costUsd).toBeCloseTo(0.003, 4);
  });

  it("quando 3 reservas de fallback chegam juntas e só cabe 1 no teto do fallback, então só 1 é concedida", async () => {
    const user = await linkedUser(10);
    await db.insert(aiUsage).values({ date: today(), requests: 1, costUsd: 0, fallbackCostUsd: 0.99 });
    const reservations = await Promise.all([0, 1, 2].map(() => reserveAiBudget(user.id, 0.003)));

    const granted = await Promise.all(reservations.map((r) => reserveFallback(r, 0.02)));

    expect(granted.filter(Boolean)).toHaveLength(1);
    expect((await globalRow()).fallbackCostUsd).toBeCloseTo(1.01, 4);
  });
});

describe("#13 Checkout fora da janela de 1 minuto da idempotency key", () => {
  /** Faz o relógio andar `shift` ms à frente, para cair em outra janela de 1 minuto sem esperar. */
  function clock() {
    const real = Date.now.bind(Date);
    const state = { shift: 0 };
    const spy = vi.spyOn(Date, "now").mockImplementation(() => real() + state.shift);
    return { state, restore: () => spy.mockRestore() };
  }
  const openSessions = () => [...stripeState.sessions.values()].filter((s) => s.status === "open");

  it("quando o usuário clica de novo no mesmo plano em outro minuto, então recebe a MESMA sessão aberta e nenhuma nova é criada", async () => {
    const user = await createUser();
    signIn(user.clerkId);
    const t = clock();
    try {
      const first = await startCheckoutAction({ plan: "monthly" });
      t.state.shift = 120_000;
      const second = await startCheckoutAction({ plan: "monthly" });

      expect(first).toMatchObject({ ok: true });
      expect(second).toEqual(first);
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
      expect(openSessions()).toHaveLength(1);
    } finally {
      t.restore();
    }
  });

  it("quando o usuário troca de plano com um Checkout aberto, então o antigo é expirado e só 1 sessão continua aberta", async () => {
    const user = await createUser();
    signIn(user.clerkId);
    const t = clock();
    try {
      await startCheckoutAction({ plan: "monthly" });
      t.state.shift = 120_000;
      const annual = await startCheckoutAction({ plan: "annual" });

      expect(annual).toMatchObject({ ok: true });
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(2);
      expect(stripeMock.checkout.sessions.expire).toHaveBeenCalledTimes(1);
      const open = openSessions();
      expect(open).toHaveLength(1);
      expect(open[0].metadata.plan).toBe("annual");
    } finally {
      t.restore();
    }
  });

  it("quando a sessão anterior já expirou ou foi concluída, então uma nova é criada normalmente", async () => {
    const user = await createUser();
    signIn(user.clerkId);
    const t = clock();
    try {
      await startCheckoutAction({ plan: "monthly" });
      for (const s of stripeState.sessions.values()) s.status = "expired";
      t.state.shift = 120_000;

      const again = await startCheckoutAction({ plan: "monthly" });

      expect(again).toMatchObject({ ok: true });
      expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(2);
      expect(openSessions()).toHaveLength(1);
    } finally {
      t.restore();
    }
  });
});

describe("#14 cron de fechamento por inatividade", () => {
  const batchTrigger = vi.fn(async (..._args: unknown[]) => ({ batchId: "batch_1" }));
  const keysOf = () => (batchTrigger.mock.calls.at(-1)![0] as { options: { idempotencyKey: string } }[]).map((i) => i.options.idempotencyKey);

  it("quando a mesma sessão fica ociosa de novo depois de uma run que não fechou nada, então a chave é nova e o cron cria outra run", async () => {
    (closeInactiveSession as unknown as { batchTrigger: unknown }).batchTrigger = batchTrigger;
    const { user } = await createSubscribedUser("active");
    const firstIdle = new Date(Date.now() - 3 * 3_600_000);
    const session = await createSession(user.id, { open: true, startedAt: firstIdle, lastSetAt: firstIdle });

    await closeIdleSessions(new Date());
    const first = keysOf();
    // O mesmo período ocioso visto por outro tick: continua deduplicado (mesma chave).
    await closeIdleSessions(new Date());
    expect(keysOf()).toEqual(first);

    // Uma série chegou depois do tick (a run anterior terminou com { closed: false } e guarda a chave por 30 dias)
    // e a sessão ficou ociosa DE NOVO: precisa de uma chave nova.
    const secondIdle = new Date(Date.now() - 2 * 3_600_000);
    await db.update(sessions).set({ lastSetAt: secondIdle }).where(eq(sessions.id, session.id));
    await closeIdleSessions(new Date());

    expect(keysOf()).toHaveLength(1);
    expect(keysOf()[0]).not.toBe(first[0]);
    expect(first[0]).toContain(String(firstIdle.getTime()));
    expect(keysOf()[0]).toContain(String(secondIdle.getTime()));
  });
});

describe("#3 syncSubscription com snapshots fora de ordem", () => {
  it("quando um snapshot antigo (ativa) termina DEPOIS de um novo (cancelada), então a assinatura continua cancelada", async () => {
    const user = await createUser({ stripeCustomerId: "cus_x" });
    putSubscription({ id: "sub_1", customer: "cus_x", status: "canceled" });
    const stale = { ...stripeState.subscriptions.get("sub_1")!, status: "active" };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    // A 1ª chamada pede o snapshot primeiro, mas a resposta dela só chega depois.
    stripeMock.subscriptions.retrieve.mockImplementationOnce(async () => {
      await gate;
      return stale as never;
    });

    const slow = syncSubscription("sub_1");
    await new Promise((r) => setTimeout(r, 15));
    await syncSubscription("sub_1");
    release();
    await slow;

    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    expect(row.status).toBe("canceled");
  });

  it("quando um snapshot mais novo chega depois do antigo, então ele vale (a ordem normal continua funcionando)", async () => {
    const user = await createUser({ stripeCustomerId: "cus_y" });
    putSubscription({ id: "sub_2", customer: "cus_y", status: "active" });
    await syncSubscription("sub_2");
    await new Promise((r) => setTimeout(r, 15));
    putSubscription({ id: "sub_2", customer: "cus_y", status: "canceled" });

    await syncSubscription("sub_2");

    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    expect(row.status).toBe("canceled");
  });

  it("quando uma assinatura nova chega e a salva já terminou, então a nova assume a linha mesmo com snapshot mais antigo", async () => {
    const user = await createUser({ stripeCustomerId: "cus_z" });
    await createSubscription(user.id, { stripeSubscriptionId: "sub_old", status: "canceled", syncedFrom: new Date(Date.now() + 60_000) });
    putSubscription({ id: "sub_new", customer: "cus_z", status: "active" });

    await syncSubscription("sub_new");

    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    expect(row).toMatchObject({ stripeSubscriptionId: "sub_new", status: "active" });
  });
});
