import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiUsage, aiUsageUser, db, messages, sessions, setEntries, setTargets, telegramLinks } from "@/db";
import { handleUpdate } from "@/lib/bot/handle-update";
import { createLinkToken } from "@/lib/services/users";
import { closeSession } from "@/lib/services/workout";
import * as render from "@/lib/telegram/render";
import { createExercise, createSession, createSet, createSubscribedUser, linkTelegram } from "./helpers/factories";
import { openaiParse, openaiState, telegramCalls, telegramState, telegramTexts } from "./helpers/mocks";
import { telegramCallbackUpdate, telegramTextUpdate } from "./helpers/requests";

// O atalho sem modelo (FAST_PATH) fica desligado: todo texto passa pelo OpenAI simulado, e o que o
// "modelo" devolve é controlado por `openaiState.parsed`.
beforeEach(() => vi.stubEnv("FAST_PATH", "off"));

type Update = ReturnType<typeof telegramTextUpdate>;
const handle = (update: Update) => handleUpdate(update as never, { isLastAttempt: true, log: vi.fn(), report: vi.fn() });
const today = () => new Date().toISOString().slice(0, 10);

const logIntent = (exercise: string, weight: number, reps: number, sets: number) => ({
  intent: { type: "log_sets", groups: [{ exercise, exercise_named: true, weight_kg: weight, reps, sets }] },
  confidence: 1,
});

/** Usuário vinculado ao chat, com assinatura (ou sem, se `status` for null). */
async function linkedUser(chatId: number, status: string | null = "active") {
  const { user } = await createSubscribedUser(status);
  await linkTelegram(user.id, chatId);
  return user;
}
const setsOf = async (userId: string) =>
  db.select({ set: setEntries }).from(setEntries).innerJoin(sessions, eq(sessions.id, setEntries.sessionId)).where(eq(sessions.userId, userId));
const openSessions = (userId: string) => db.select().from(sessions).where(and(eq(sessions.userId, userId), isNull(sessions.endedAt)));

describe("handleUpdate — acesso", () => {
  it("quando o usuário sem assinatura manda mensagem ou toca botão, então recebe 'assinatura necessária' e NENHUMA chamada ao OpenAI é feita", async () => {
    await linkedUser(10, null);
    openaiState.parsed = logIntent("supino", 80, 8, 3);

    const message = await handle(telegramTextUpdate(10, "supino 80x8 3 séries"));
    const tap = await handle(telegramCallbackUpdate(10, "qualquer:coisa") as never);

    expect(message.status).toBe("ignored");
    expect(tap.status).toBe("ignored");
    expect(telegramTexts().filter((t) => t === render.subscriptionRequired())).toHaveLength(2);
    expect(openaiParse).not.toHaveBeenCalled();
    expect(await db.select().from(setEntries)).toHaveLength(0);
  });

  it("quando o usuário sem assinatura manda /start <token>, então o vínculo funciona", async () => {
    const { user } = await createSubscribedUser(null);
    const token = await createLinkToken(user.id);

    const result = await handle(telegramTextUpdate(77, `/start ${token}`));

    expect(result).toMatchObject({ kind: "link", userId: user.id });
    expect(await db.select().from(telegramLinks).where(eq(telegramLinks.userId, user.id))).toMatchObject([{ chatId: 77 }]);
    expect(openaiParse).not.toHaveBeenCalled();
  });
});

describe("handleUpdate — registro de séries", () => {
  it("quando a mensagem 'supino 80x8 3 séries' chega, então grava 3 séries do usuário certo e recalcula alvos", async () => {
    const user = await linkedUser(10);
    const supino = await createExercise({ name: "Supino reto", aliases: ["supino"] });
    openaiState.parsed = logIntent("supino", 80, 8, 3);

    const result = await handle(telegramTextUpdate(10, "supino 80x8 3 séries"));

    expect(result).toMatchObject({ status: "processed", intent: "log_sets", userId: user.id });
    const sets = (await setsOf(user.id)).map((r) => r.set);
    expect(sets).toHaveLength(3);
    expect(sets.every((s) => s.exerciseId === supino.id && s.weight === 80 && s.reps === 8 && !s.voidedAt)).toBe(true);
    expect(sets.map((s) => s.setPosition).sort()).toEqual([1, 2, 3]);
    const targets = await db.select().from(setTargets).where(eq(setTargets.userId, user.id));
    expect(targets.map((t) => ({ exerciseId: t.exerciseId, setPosition: t.setPosition, weight: t.weight, reps: t.reps })).sort((a, b) => a.setPosition - b.setPosition)).toEqual(
      [1, 2, 3].map((setPosition) => ({ exerciseId: supino.id, setPosition, weight: 80, reps: 8 })),
    );
  });

  it("quando o mesmo update_id é processado 2 vezes, então as séries são gravadas uma vez só", async () => {
    const user = await linkedUser(10);
    await createExercise({ name: "Supino reto", aliases: ["supino"] });
    openaiState.parsed = logIntent("supino", 80, 8, 3);
    const update = telegramTextUpdate(10, "supino 80x8 3 séries");

    const first = await handle(update);
    const second = await handle(update);

    expect(first.status).toBe("processed");
    expect(second.status).toBe("duplicate");
    expect(await setsOf(user.id)).toHaveLength(3);
    expect(openaiParse).toHaveBeenCalledTimes(1);
    expect(await db.select().from(messages)).toHaveLength(1);
  });

  it("quando o envio da resposta falha, então a nova tentativa entrega a resposta salva sem refazer o parse nem gravar de novo", async () => {
    const user = await linkedUser(10);
    await createExercise({ name: "Supino reto", aliases: ["supino"] });
    openaiState.parsed = logIntent("supino", 80, 8, 3);
    const update = telegramTextUpdate(10, "supino 80x8 3 séries");
    telegramState.fail.set("sendMessage", { code: 502, description: "Bad Gateway" });

    await expect(handle(update)).rejects.toThrow();
    const [failed] = await db.select().from(messages).where(eq(messages.updateId, update.update_id));
    expect(failed).toMatchObject({ status: "processed", repliesSent: 0 });
    const replies = failed.replies as { text: string }[];
    expect(replies.length).toBeGreaterThan(0);

    telegramState.fail.clear();
    telegramCalls.length = 0;
    const retried = await handle(update);

    expect(retried.status).toBe("duplicate");
    expect(telegramTexts()).toEqual(replies.map((r) => r.text));
    expect(openaiParse).toHaveBeenCalledTimes(1);
    expect(await setsOf(user.id)).toHaveLength(3);
    const [done] = await db.select().from(messages).where(eq(messages.updateId, update.update_id));
    expect(done.repliesSent).toBe(replies.length);

    // Uma redelivery depois de tudo entregue não reenvia nada.
    telegramCalls.length = 0;
    await handle(update);
    expect(telegramTexts()).toEqual([]);
  });

  it("quando 2 updates diferentes do mesmo usuário rodam ao mesmo tempo sem sessão aberta, então existe no máximo 1 sessão aberta", async () => {
    const user = await linkedUser(10);
    await createExercise({ name: "Supino reto", aliases: ["supino"] });
    openaiState.parsed = logIntent("supino", 80, 8, 1);
    const updates = [telegramTextUpdate(10, "supino 80x8"), telegramTextUpdate(10, "supino 80x8")];

    const results = await Promise.allSettled(updates.map(handle));

    // O Trigger refaz uma execução que lançou erro (retry): quem perdeu a corrida roda de novo, já com sessão aberta.
    for (const [i, r] of results.entries()) if (r.status === "rejected") await handle(updates[i]);

    expect(await openSessions(user.id)).toHaveLength(1);
    expect(await setsOf(user.id)).toHaveLength(2);
    expect(telegramTexts()).not.toContain(render.unavailable());
  });

  it("quando o usuário A está vinculado ao chat X, então nenhuma gravação cai na conta do usuário B", async () => {
    const a = await linkedUser(10);
    const b = await linkedUser(20);
    await createExercise({ name: "Supino reto", aliases: ["supino"] });
    openaiState.parsed = logIntent("supino", 80, 8, 2);

    await handle(telegramTextUpdate(10, "supino 80x8 2 séries"));

    expect(await setsOf(a.id)).toHaveLength(2);
    expect(await setsOf(b.id)).toHaveLength(0);
    expect(await db.select().from(sessions).where(eq(sessions.userId, b.id))).toHaveLength(0);
    expect(await db.select().from(setTargets).where(eq(setTargets.userId, b.id))).toHaveLength(0);
  });

  it("quando a sessão está parada há 90 min e chega uma série nova, então a antiga fecha e abre outra", async () => {
    const user = await linkedUser(10);
    const supino = await createExercise({ name: "Supino reto", aliases: ["supino"] });
    const idleSince = new Date(Date.now() - 100 * 60_000);
    const old = await createSession(user.id, { open: true, startedAt: new Date(idleSince.getTime() - 30 * 60_000), lastSetAt: idleSince });
    await createSet(old.id, supino.id, { createdAt: idleSince });
    openaiState.parsed = logIntent("supino", 80, 8, 1);

    await handle(telegramTextUpdate(10, "supino 80x8"));

    const all = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(all).toHaveLength(2);
    const closed = all.find((s) => s.id === old.id)!;
    expect(closed).toMatchObject({ closeReason: "inactive" });
    expect(closed.endedAt?.getTime()).toBe(idleSince.getTime());
    const open = await openSessions(user.id);
    expect(open).toHaveLength(1);
    expect(open[0].id).not.toBe(old.id);
  });
});

describe("handleUpdate — limites de custo do OpenAI", () => {
  it("quando o orçamento diário global estoura, então não há chamada ao modelo e o usuário recebe aviso", async () => {
    const user = await linkedUser(10);
    await db.insert(aiUsage).values({ date: today(), requests: 100, costUsd: 5 });

    const result = await handle(telegramTextUpdate(10, "supino 80x8"));

    expect(result).toMatchObject({ status: "failed", userId: user.id });
    expect(openaiParse).not.toHaveBeenCalled();
    expect(telegramTexts()).toContain(render.unavailable());
    expect(await db.select().from(setEntries)).toHaveLength(0);
  });

  it("quando o orçamento diário do usuário estoura, então não há chamada ao modelo e o usuário recebe aviso", async () => {
    const user = await linkedUser(10);
    await db.insert(aiUsageUser).values({ userId: user.id, date: today(), requests: 50, costUsd: 0.25 });

    const result = await handle(telegramTextUpdate(10, "supino 80x8"));

    expect(result).toMatchObject({ status: "failed", userId: user.id });
    expect(openaiParse).not.toHaveBeenCalled();
    expect(telegramTexts()).toContain(render.rateLimited());
  });

  it("quando o orçamento do usuário A estoura, então o usuário B continua sendo atendido", async () => {
    const a = await linkedUser(10);
    await linkedUser(20);
    await createExercise({ name: "Supino reto", aliases: ["supino"] });
    await db.insert(aiUsageUser).values({ userId: a.id, date: today(), requests: 50, costUsd: 0.25 });
    openaiState.parsed = logIntent("supino", 80, 8, 1);

    expect(await handle(telegramTextUpdate(10, "supino 80x8"))).toMatchObject({ status: "failed" });
    expect(await handle(telegramTextUpdate(20, "supino 80x8"))).toMatchObject({ status: "processed" });
    expect(openaiParse).toHaveBeenCalledTimes(1);
  });
});

describe("fechamento de sessão", () => {
  it("quando se fecha a mesma sessão duas vezes ao mesmo tempo, então só uma gera resumo", async () => {
    const { user } = await createSubscribedUser("active");
    const exercise = await createExercise();
    const session = await createSession(user.id, { open: true });
    await createSet(session.id, exercise.id);

    const results = await Promise.all([closeSession(user, session.id, "user", null), closeSession(user, session.id, "user", null)]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await db.select().from(sessions).where(eq(sessions.id, session.id)))[0].closeReason).toBe("user");
  });

  it("quando uma sessão fecha sem séries válidas, então é removida", async () => {
    const { user } = await createSubscribedUser("active");
    const exercise = await createExercise();
    const session = await createSession(user.id, { open: true });
    await createSet(session.id, exercise.id, { voidedAt: new Date() });

    expect(await closeSession(user, session.id, "user", null)).toBeNull();
    expect(await db.select().from(sessions).where(eq(sessions.id, session.id))).toHaveLength(0);
  });

  it("quando outro usuário tenta fechar a sessão, então nada acontece e a sessão segue aberta", async () => {
    const { user: owner } = await createSubscribedUser("active");
    const { user: intruder } = await createSubscribedUser("active");
    const exercise = await createExercise();
    const session = await createSession(owner.id, { open: true });
    await createSet(session.id, exercise.id);

    expect(await closeSession(intruder, session.id, "user", null)).toBeNull();

    const [row] = await db.select().from(sessions).where(eq(sessions.id, session.id));
    expect(row.endedAt).toBeNull();
    expect(row.closeReason).toBeNull();
  });

  it("não envia nada ao Telegram em updates ignorados de chat desconhecido além do aviso", async () => {
    await handle(telegramTextUpdate(31337, "oi"));
    expect(telegramTexts()).toEqual([render.notLinked()]);
    expect(telegramCalls.every((c) => c.method !== "setWebhook")).toBe(true);
  });
});
