import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTelegramLinkAction } from "@/app/(app)/actions";
import { POST } from "@/app/api/telegram/webhook/route";
import { db, linkTokens, telegramLinks, usageCounters } from "@/db";
import { handleUpdate } from "@/lib/bot/handle-update";
import { localTime } from "@/lib/engine/reminders";
import { createLinkToken } from "@/lib/services/users";
import * as render from "@/lib/telegram/render";
import { createUser, linkTelegram } from "./helpers/factories";
import { signIn, telegramTexts, triggerMock } from "./helpers/mocks";
import { telegramCallbackUpdate, telegramTextUpdate, telegramWebhookRequest } from "./helpers/requests";

afterEach(() => vi.unstubAllEnvs());

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const handle = (update: ReturnType<typeof telegramTextUpdate>) => handleUpdate(update as never, { isLastAttempt: true, log: vi.fn(), report: vi.fn() });
const linksOf = (userId: string) => db.select().from(telegramLinks).where(eq(telegramLinks.userId, userId));
const tokenFromUrl = (url: string) => new URL(url).searchParams.get("start")!;

describe("createTelegramLinkAction + /start <token>", () => {
  it("quando o usuário gera o link, então só o hash do token vai ao banco e expira em 15 min", async () => {
    const user = await createUser();
    signIn(user.clerkId);

    const result = await createTelegramLinkAction();

    expect(result.ok).toBe(true);
    const token = tokenFromUrl((result as { data: { url: string } }).data.url);
    const rows = await db.select().from(linkTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(sha256(token));
    expect(JSON.stringify(rows)).not.toContain(token);
    const minutes = (rows[0].expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);
  });

  it("quando o token é usado, então vincula o chat ao usuário", async () => {
    const user = await createUser();
    const token = await createLinkToken(user.id);

    const result = await handle(telegramTextUpdate(555, `/start ${token}`));

    expect(result).toMatchObject({ status: "processed", kind: "link", userId: user.id });
    expect(await linksOf(user.id)).toMatchObject([{ chatId: 555 }]);
    expect(telegramTexts()).toContain(render.linked(false));
  });

  it("quando o mesmo token é usado de novo, então 'link inválido'", async () => {
    const user = await createUser();
    const token = await createLinkToken(user.id);
    await handle(telegramTextUpdate(555, `/start ${token}`));

    const again = await handle(telegramTextUpdate(777, `/start ${token}`));

    expect(again).toMatchObject({ kind: "link", linkError: "invalid" });
    expect(telegramTexts().at(-1)).toBe(render.linkInvalid());
    expect(await linksOf(user.id)).toMatchObject([{ chatId: 555 }]);
  });

  it("quando o token está expirado ou não existe, então 'link inválido' e nada é vinculado", async () => {
    const user = await createUser();
    const expired = await createLinkToken(user.id);
    await db.update(linkTokens).set({ expiresAt: new Date(Date.now() - 1000) });

    expect(await handle(telegramTextUpdate(555, `/start ${expired}`))).toMatchObject({ linkError: "invalid" });
    expect(await handle(telegramTextUpdate(556, `/start ${"x".repeat(32)}`))).toMatchObject({ linkError: "invalid" });

    expect(await db.select().from(telegramLinks)).toHaveLength(0);
    expect(telegramTexts()).toEqual([render.linkInvalid(), render.linkInvalid()]);
  });

  it("quando 2 chats usam o mesmo token ao mesmo tempo, então só 1 vincula", async () => {
    const user = await createUser();
    const token = await createLinkToken(user.id);

    const results = await Promise.all([handle(telegramTextUpdate(111, `/start ${token}`)), handle(telegramTextUpdate(222, `/start ${token}`))]);

    expect(results.filter((r) => r.userId === user.id)).toHaveLength(1);
    expect(results.filter((r) => r.linkError === "invalid")).toHaveLength(1);
    expect(await linksOf(user.id)).toHaveLength(1);
  });

  it("quando o chat já pertence a OUTRO usuário, então 'chat ocupado' e o vínculo do outro não muda", async () => {
    const owner = await createUser();
    const intruder = await createUser();
    await linkTelegram(owner.id, 999);
    const token = await createLinkToken(intruder.id);

    const result = await handle(telegramTextUpdate(999, `/start ${token}`));

    expect(result).toMatchObject({ kind: "link", linkError: "chat_taken" });
    expect(telegramTexts().at(-1)).toBe(render.linkChatTaken());
    expect(await linksOf(owner.id)).toMatchObject([{ chatId: 999 }]);
    expect(await linksOf(intruder.id)).toHaveLength(0);
    // O token foi consumido: o usuário precisa gerar outro.
    const [row] = await db.select().from(linkTokens);
    expect(row.usedAt).not.toBeNull();
  });

  it("quando o usuário vincula um novo chat, então o chat anterior é substituído (1 chat por conta)", async () => {
    const user = await createUser();
    await linkTelegram(user.id, 111);
    const token = await createLinkToken(user.id);

    await handle(telegramTextUpdate(222, `/start ${token}`));

    expect(await linksOf(user.id)).toMatchObject([{ chatId: 222 }]);
  });
});

describe("POST /api/telegram/webhook", () => {
  const update = (chatId = 42) => telegramTextUpdate(chatId, "supino 3x10 80kg");

  it.each([
    ["errado", { secret: "outro-segredo" }],
    ["ausente", { secret: null }],
  ])("quando o segredo é %s, então 401 e nada é enfileirado", async (_label, opts) => {
    const res = await POST(telegramWebhookRequest(update(), opts));
    expect(res.status).toBe(401);
    expect(triggerMock.trigger).not.toHaveBeenCalled();
  });

  it("quando o segredo não está configurado no servidor, então 401 e nada é enfileirado", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    const res = await POST(telegramWebhookRequest(update(), { secret: "qualquer" }));
    expect(res.status).toBe(401);
    expect(triggerMock.trigger).not.toHaveBeenCalled();
  });

  it("quando o corpo não é JSON, então 400", async () => {
    const res = await POST(telegramWebhookRequest("isso não é json"));
    expect(res.status).toBe(400);
    expect(triggerMock.trigger).not.toHaveBeenCalled();
  });

  it("quando o chat não é privado ou o update não tem update_id, então 200 e ignora", async () => {
    const group = update();
    group.message.chat.type = "group";
    const { update_id: _omit, ...noId } = update();

    expect((await POST(telegramWebhookRequest(group))).status).toBe(200);
    expect((await POST(telegramWebhookRequest(noId))).status).toBe(200);
    expect(triggerMock.trigger).not.toHaveBeenCalled();
  });

  it("quando o chat é de usuário vinculado, então enfileira com idempotencyKey por update_id e concurrencyKey por usuário", async () => {
    const user = await createUser();
    await linkTelegram(user.id, 42);
    const msg = update(42);

    const res = await POST(telegramWebhookRequest(msg));

    expect(res.status).toBe(200);
    expect(triggerMock.trigger).toHaveBeenCalledTimes(1);
    expect(triggerMock.trigger).toHaveBeenCalledWith(
      "telegram-handle-update",
      expect.objectContaining({ update: expect.objectContaining({ update_id: msg.update_id }) }),
      expect.objectContaining({ idempotencyKey: `idem:global:tg-update-${msg.update_id}`, concurrencyKey: user.id }),
    );
  });

  it("quando o mesmo update_id chega 2 vezes, então a chave de idempotência é a mesma", async () => {
    const user = await createUser();
    await linkTelegram(user.id, 42);
    const msg = update(42);

    await POST(telegramWebhookRequest(msg));
    await POST(telegramWebhookRequest(msg));

    const keys = triggerMock.trigger.mock.calls.map((c) => (c[2] as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  /** Usuário vinculado cujo contador de hoje já está em `count`. */
  async function linkedWithCount(count: number) {
    const user = await createUser();
    await linkTelegram(user.id, 42);
    const date = localTime(new Date(), user.timezone).date;
    if (count) await db.insert(usageCounters).values({ userId: user.id, date, count });
    return { user, date };
  }
  const counter = async (userId: string) => (await db.select().from(usageCounters).where(eq(usageCounters.userId, userId)))[0]?.count ?? 0;

  it("quando o usuário passa do limite diário (60), então 200, avisa 1 vez só e NÃO enfileira", async () => {
    const { user } = await linkedWithCount(60);

    const first = await POST(telegramWebhookRequest(update()));
    const second = await POST(telegramWebhookRequest(update()));

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(triggerMock.trigger).not.toHaveBeenCalled();
    expect(telegramTexts()).toEqual([render.rateLimited(60)]);
    expect(await counter(user.id)).toBe(62);
  });

  it("quando passa do limite mensal, então avisa 1 vez só e NÃO enfileira", async () => {
    vi.stubEnv("MONTHLY_MESSAGE_LIMIT", "5");
    await linkedWithCount(5);

    const first = await POST(telegramWebhookRequest(update()));
    const second = await POST(telegramWebhookRequest(update()));

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(triggerMock.trigger).not.toHaveBeenCalled();
    expect(telegramTexts()).toEqual([render.monthlyLimited(5)]);
  });

  it("quando o usuário manda exatamente o 60º do dia, então é processado; o 61º é bloqueado", async () => {
    await linkedWithCount(59);

    await POST(telegramWebhookRequest(update()));
    expect(triggerMock.trigger).toHaveBeenCalledTimes(1);
    expect(telegramTexts()).toEqual([]);

    await POST(telegramWebhookRequest(update()));
    expect(triggerMock.trigger).toHaveBeenCalledTimes(1);
    expect(telegramTexts()).toEqual([render.rateLimited(60)]);
  });

  it("quando 70 mensagens chegam ao mesmo tempo, então o contador termina em 70 e exatamente 60 são enfileiradas, com 1 só aviso", async () => {
    const { user } = await linkedWithCount(0);

    const responses = await Promise.all(Array.from({ length: 70 }, () => POST(telegramWebhookRequest(update()))));

    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(await counter(user.id)).toBe(70);
    expect(triggerMock.trigger).toHaveBeenCalledTimes(60);
    expect(telegramTexts()).toEqual([render.rateLimited(60)]);
  });

  it("quando o usuário toca num botão (callback), então não conta para o limite", async () => {
    const { user } = await linkedWithCount(60);

    const res = await POST(telegramWebhookRequest(telegramCallbackUpdate(42, "algum:botao")));

    expect(res.status).toBe(200);
    expect(triggerMock.trigger).toHaveBeenCalledTimes(1);
    expect(await counter(user.id)).toBe(60);
    expect(telegramTexts()).toEqual([]);
  });

  it("quando o chat não está vinculado, então não conta nem consome limite de ninguém", async () => {
    const other = await createUser();
    await linkTelegram(other.id, 1);

    const res = await POST(telegramWebhookRequest(update(9999)));

    expect(res.status).toBe(200);
    expect(await db.select().from(usageCounters)).toHaveLength(0);
    expect(triggerMock.trigger).toHaveBeenCalledWith(
      "telegram-handle-update",
      expect.anything(),
      expect.objectContaining({ concurrencyKey: "chat_9999" }),
    );
  });
});
