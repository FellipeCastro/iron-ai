import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiUsage, aiUsageUser, db, exercises, messages, sessions, setEntries, telegramLinks, users } from "@/db";
import { MAX_VOICE_SECONDS } from "@/lib/ai/transcribe";
import { handleUpdate } from "@/lib/bot/handle-update";
import { siteUrl } from "@/lib/env";
import { loadRoutine, saveRoutine } from "@/lib/services/routine";
import { logSets } from "@/lib/services/workout";
import * as render from "@/lib/telegram/render";
import { createExercise, createSession, createSet, createSubscribedUser, linkTelegram } from "./helpers/factories";
import { openaiState, telegramCalls, telegramTexts } from "./helpers/mocks";
import { telegramCallbackUpdate, telegramTextUpdate } from "./helpers/requests";

// TESTES DE CARACTERIZAÇÃO do fluxo do bot (lib/bot/handle-update.ts) e do retorno de logSets.
// Registram o que o código FAZ HOJE, mesmo quando parece estranho: servem de rede de segurança para a refatoração
// em camadas. Não corrigem nada. Comportamentos suspeitos estão marcados com "CARACTERIZAÇÃO:" e listados em tests/BUGS.md.
// O atalho sem modelo (FAST_PATH) fica desligado: todo texto passa pelo OpenAI simulado (`openaiState.parsed`).
beforeEach(() => vi.stubEnv("FAST_PATH", "off"));

type Update = ReturnType<typeof telegramTextUpdate> | ReturnType<typeof telegramCallbackUpdate>;
const opts = { isLastAttempt: true, log: vi.fn(), report: vi.fn() };
const handle = (update: Update) => handleUpdate(update as never, opts);
const handleRaw = (update: unknown) => handleUpdate(update as never, opts);

const CHAT = 10;
const text = (t: string) => telegramTextUpdate(CHAT, t);
const tap = (data: string) => telegramCallbackUpdate(CHAT, data);

async function linkedUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const { user } = await createSubscribedUser("active", overrides);
  await linkTelegram(user.id, CHAT);
  return user;
}

type Button = { text: string; callback_data: string };
/** Botões do último teclado inline enviado (ou editado) pelo bot. */
const lastKeyboard = (): Button[] => {
  const call = [...telegramCalls].reverse().find((c) => c.body.reply_markup);
  return (call?.body.reply_markup as { inline_keyboard: Button[][] } | undefined)?.inline_keyboard.flat() ?? [];
};
const buttonLabeled = (label: string) => lastKeyboard().find((b) => b.text.includes(label))!;

type StoredChatState = {
  pending: ({ kind: string; id: string } & Record<string, unknown>) | null;
  dayOverride?: { letter: string } | null;
};
// `chat_state` fica NULL até o bot gravar o primeiro passo: equivale a "sem passo pendente".
const chatStateOf = async (userId: string) =>
  ((await db.select().from(telegramLinks).where(eq(telegramLinks.userId, userId)))[0].chatState as StoredChatState | null) ?? { pending: null };
const setPending = (userId: string, pending: Record<string, unknown>) =>
  db
    .update(telegramLinks)
    .set({ chatState: { pending: { ...pending, at: Date.now() } } as never })
    .where(eq(telegramLinks.userId, userId));

const validSets = async (userId: string) =>
  (await db.select({ set: setEntries }).from(setEntries).innerJoin(sessions, eq(sessions.id, setEntries.sessionId)).where(and(eq(sessions.userId, userId), isNull(setEntries.voidedAt)))).map((r) => r.set);
const userRow = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0];

/** Rotina do usuário: dias na ordem dada (A, B…), cada um com [exercício, séries planejadas]. */
async function withRoutine(userId: string, days: { title: string; exercises: [{ id: string }, number][] }[]) {
  await saveRoutine(
    userId,
    days.map((d) => ({ title: d.title, exercises: d.exercises.map(([e, n]) => ({ exerciseId: e.id, plannedSets: n })) })),
  );
}

const logIntent = (exercise: string, weight: number | null, reps: number, sets: number, named = true) => ({
  intent: { type: "log_sets", groups: [{ exercise, exercise_named: named, weight_kg: weight, reps, sets }] },
  confidence: 1,
});
const reportIntent = (scope: string, extra: Record<string, unknown> = {}) => ({
  intent: { type: "ask_report", scope, exercise: null, muscle_group: null, day: null, ...extra },
  confidence: 1,
});
const scrub = (s: string) =>
  s
    .replaceAll(siteUrl(), "<SITE>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<ID>");

// ---------------------------------------------------------------------------------------------------------------------

describe("bot — onboarding da rotina pelo chat", () => {
  it("quando o modelo devolve setup_routine, então responde o rascunho (catálogo ou 'novo') e guarda o passo 'routine'", async () => {
    const user = await linkedUser();
    const supino = await createExercise({ name: "Supino reto", aliases: ["supino"] });
    openaiState.parsed = {
      intent: {
        type: "setup_routine",
        days: [{ title: "Peito", exercises: [{ name: "supino", sets: 3, muscle_group: "peito" }, { name: "Rosca marciana", sets: 2, muscle_group: "biceps" }] }],
      },
      confidence: 1,
    };

    const result = await handle(text("A: supino 3, rosca marciana 2"));

    expect(result).toMatchObject({ status: "processed", kind: "message", intent: "setup_routine" });
    expect(telegramTexts()).toEqual([
      render.routineDraft([
        { title: "Peito", exercises: [{ name: "Supino reto", sets: 3, id: supino.id }, { name: "Rosca marciana", sets: 2, id: null }] },
      ]),
    ]);
    expect(lastKeyboard().map((b) => b.text)).toEqual(["✅ Salvar treinos", "✖️ Cancelar"]);
    expect(await loadRoutine(user.id)).toBeNull();
    expect((await chatStateOf(user.id)).pending).toMatchObject({ kind: "routine" });
  });

  it("quando toca em 'Salvar treinos', então salva a rotina (criando o exercício novo do usuário) e pergunta os dias", async () => {
    const user = await linkedUser();
    const supino = await createExercise({ name: "Supino reto" });
    await setPending(user.id, {
      kind: "routine",
      id: "rt1",
      days: [{ title: "Peito", exercises: [{ id: supino.id, name: "Supino reto", sets: 3, muscleGroup: "peito" }, { id: null, name: "Rosca marciana", sets: 2, muscleGroup: "biceps" }] }],
    });

    const result = await handle(tap("ok:rt1"));

    expect(result).toMatchObject({ status: "processed", kind: "callback", userId: user.id });
    expect(telegramTexts()).toEqual([render.routineSaved("Peito"), render.askDays()]);
    const routine = await loadRoutine(user.id);
    expect(routine?.days.map((d) => ({ letter: d.letter, title: d.title, exercises: d.exercises.map((e) => [e.name, e.plannedSets]) }))).toEqual([
      { letter: "A", title: "Peito", exercises: [["Supino reto", 3], ["Rosca marciana", 2]] },
    ]);
    const owned = await db.select().from(exercises).where(eq(exercises.ownerUserId, user.id));
    expect(owned.map((e) => [e.name, e.muscleGroup])).toEqual([["Rosca marciana", "biceps"]]);
    expect((await chatStateOf(user.id)).pending).toMatchObject({ kind: "days" });
    expect(telegramCalls.map((c) => c.method)).toEqual(["answerCallbackQuery", "editMessageText", "sendMessage"]);
  });

  it("quando toca em 'Cancelar' no rascunho, então nada é salvo", async () => {
    const user = await linkedUser();
    await setPending(user.id, { kind: "routine", id: "rt1", days: [{ title: "Peito", exercises: [{ id: null, name: "Rosca marciana", sets: 2, muscleGroup: "biceps" }] }] });

    await handle(tap("no:rt1"));

    expect(telegramTexts()).toEqual([render.cancelled()]);
    expect(await loadRoutine(user.id)).toBeNull();
    expect((await chatStateOf(user.id)).pending).toBeNull();
  });

  it("quando responde os dias da semana, então grava users.training_days e pergunta o horário", async () => {
    const user = await linkedUser();
    await setPending(user.id, { kind: "days", id: "d1" });

    await handle(text("segunda, quarta e sexta"));

    expect(telegramTexts()).toEqual([render.askTime()]);
    expect((await userRow(user.id)).trainingDays).toEqual([1, 3, 5]);
    expect((await chatStateOf(user.id)).pending).toMatchObject({ kind: "time" });
  });

  it("quando os dias não são entendidos, então repete a pergunta e mantém o mesmo passo (inclusive para uma série digitada)", async () => {
    const user = await linkedUser();
    await setPending(user.id, { kind: "days", id: "d1" });

    const first = await handle(text("banana"));
    // CARACTERIZAÇÃO: qualquer texto sem barra é consumido pelo passo, até "supino 10x20" (não chega ao modelo).
    const second = await handle(text("supino 10x20"));

    expect(first).toMatchObject({ status: "processed", kind: "message" });
    expect(second).toMatchObject({ status: "processed", kind: "message" });
    expect(telegramTexts()).toEqual([render.askDays(true), render.askDays(true)]);
    expect((await userRow(user.id)).trainingDays).toEqual([]);
    expect(await chatStateOf(user.id)).toMatchObject({ pending: { kind: "days", id: "d1" } });
  });

  it("quando o horário é inválido, então pede de novo; 'sem lembrete' encerra o onboarding sem horário", async () => {
    const user = await linkedUser({ trainingDays: [1, 3, 5] });
    await setPending(user.id, { kind: "time", id: "t1" });

    await handle(text("25h"));
    expect(telegramTexts()).toEqual([render.askTime(true)]);
    expect((await chatStateOf(user.id)).pending).toMatchObject({ kind: "time", id: "t1" });

    telegramCalls.length = 0;
    await handle(text("sem lembrete"));
    expect(telegramTexts()).toEqual([render.onboardingDone([1, 3, 5], null)]);
    expect((await userRow(user.id)).reminderTime).toBeNull();
    expect((await chatStateOf(user.id)).pending).toBeNull();
  });

  it("quando responde o horário '18:30', então grava users.reminder_time e encerra o onboarding", async () => {
    const user = await linkedUser({ trainingDays: [1, 3, 5] });
    await setPending(user.id, { kind: "time", id: "t1" });

    await handle(text("18:30"));

    expect(telegramTexts()).toEqual([render.onboardingDone([1, 3, 5], "18:30")]);
    expect((await userRow(user.id)).reminderTime).toMatch(/^18:30/);
    expect((await chatStateOf(user.id)).pending).toBeNull();
  });
});

describe("bot — exercício ambíguo (botões de escolha)", () => {
  const ambiguous = async () => {
    const user = await linkedUser();
    const inclinado = await createExercise({ name: "Supino inclinado" });
    const declinado = await createExercise({ name: "Supino declinado" });
    openaiState.parsed = logIntent("supino", 80, 8, 2);
    return { user, inclinado, declinado };
  };

  it("quando o nome casa com 2 exercícios, então pergunta qual (sem gravar) e guarda o passo 'pick'", async () => {
    const { user } = await ambiguous();

    const result = await handle(text("supino 80x8 2 séries"));

    expect(result).toMatchObject({ status: "processed", intent: "log_sets" });
    expect(telegramTexts()).toEqual([render.pickExercise("supino")]);
    const labels = lastKeyboard().map((b) => b.text);
    expect(labels.at(-1)).toBe("✖️ Cancelar");
    expect(labels.slice(0, -1).sort()).toEqual(["Supino declinado", "Supino inclinado"]);
    expect(await validSets(user.id)).toHaveLength(0);
    expect((await chatStateOf(user.id)).pending).toMatchObject({ kind: "pick", slot: "g0" });
  });

  it("quando toca no exercício escolhido, então grava as séries nele e edita a mensagem dos botões", async () => {
    const { user, inclinado } = await ambiguous();
    await handle(text("supino 80x8 2 séries"));
    const choice = buttonLabeled("Supino inclinado");
    telegramCalls.length = 0;

    const result = await handle(tap(choice.callback_data));

    expect(result).toMatchObject({ status: "processed", kind: "callback" });
    const sets = await validSets(user.id);
    expect(sets.map((s) => [s.exerciseId, s.setPosition, s.weight, s.reps, s.isExtra])).toEqual([
      [inclinado.id, 1, 80, 8, false],
      [inclinado.id, 2, 80, 8, false],
    ]);
    const item = (setPosition: number) => ({ name: "Supino inclinado", setPosition, weight: 80, reps: 8, isExtra: false, record: null, target: null });
    expect(telegramTexts()).toEqual([render.setsLogged({ items: [item(1), item(2)], opened: null, upNext: null })]);
    expect(telegramCalls.map((c) => c.method)).toEqual(["answerCallbackQuery", "editMessageText"]);
    expect((await chatStateOf(user.id)).pending).toBeNull();
  });

  it("quando toca em 'Cancelar', então responde 'Ok, não registrei nada.' e nada é gravado", async () => {
    const { user } = await ambiguous();
    await handle(text("supino 80x8 2 séries"));
    const cancel = buttonLabeled("Cancelar");

    await handle(tap(cancel.callback_data));

    expect(telegramTexts().at(-1)).toBe(render.cancelled());
    expect(await validSets(user.id)).toHaveLength(0);
    expect((await chatStateOf(user.id)).pending).toBeNull();
  });

  it("quando o exercício não existe no catálogo, então responde 'não encontrei' e não guarda passo", async () => {
    const user = await linkedUser();
    await createExercise({ name: "Supino reto" });
    openaiState.parsed = logIntent("xyzabc", 20, 10, 1);

    await handle(text("xyzabc 20x10"));

    expect(telegramTexts()).toEqual([render.unknownExercise("xyzabc")]);
    expect(await validSets(user.id)).toHaveLength(0);
    expect((await chatStateOf(user.id)).pending).toBeNull();
  });
});

describe("bot — confirmação quando o modelo não tem certeza", () => {
  const lowConfidence = (intent: unknown) => (openaiState.parsed = { intent, confidence: 0.5 });
  const logOne = { type: "log_sets", groups: [{ exercise: "supino", exercise_named: true, weight_kg: 80, reps: 8, sets: 1 }] };

  it("quando a confiança é < 0,7 numa escrita, então pergunta antes de gravar", async () => {
    const user = await linkedUser();
    await createExercise({ name: "Supino reto", aliases: ["supino"] });
    lowConfidence(logOne);

    const result = await handle(text("supino 80x8"));

    expect(result).toMatchObject({ status: "processed", intent: "log_sets", confidence: 0.5 });
    expect(telegramTexts()).toEqual([render.confirmLog([{ name: "Supino reto", weight: 80, reps: 8, sets: 1 }])]);
    expect(lastKeyboard().map((b) => b.text)).toEqual(["✅ Confirmar", "✖️ Cancelar"]);
    expect(await validSets(user.id)).toHaveLength(0);
    expect((await chatStateOf(user.id)).pending).toMatchObject({ kind: "confirm" });
  });

  it("quando toca em 'Confirmar', então grava; quando toca em 'Cancelar', então descarta", async () => {
    const user = await linkedUser();
    await createExercise({ name: "Supino reto", aliases: ["supino"] });
    lowConfidence(logOne);
    await handle(text("supino 80x8"));
    const ok = buttonLabeled("Confirmar").callback_data;
    const no = buttonLabeled("Cancelar").callback_data;

    await handle(tap(no));
    expect(telegramTexts().at(-1)).toBe(render.cancelled());
    expect(await validSets(user.id)).toHaveLength(0);

    // CARACTERIZAÇÃO: o passo é apagado ao tocar em qualquer botão; reutilizar o "Confirmar" antigo expira.
    await handle(tap(ok));
    expect(telegramTexts().at(-1)).toBe(render.expiredAction());
    expect(await validSets(user.id)).toHaveLength(0);
  });

  it("quando confirma, então a série é gravada com os mesmos valores", async () => {
    const user = await linkedUser();
    const supino = await createExercise({ name: "Supino reto", aliases: ["supino"] });
    lowConfidence(logOne);
    await handle(text("supino 80x8"));

    await handle(tap(buttonLabeled("Confirmar").callback_data));

    expect((await validSets(user.id)).map((s) => [s.exerciseId, s.setPosition, s.weight, s.reps])).toEqual([[supino.id, 1, 80, 8]]);
    expect(telegramTexts().at(-1)).toContain("Supino reto");
  });

  it("quando o id do botão não é o do passo atual (ou não há passo), então 'ação não está mais disponível' e o passo continua", async () => {
    const user = await linkedUser();
    await createExercise({ name: "Supino reto", aliases: ["supino"] });
    await handle(tap("ok:zzzzzz"));
    expect(telegramTexts()).toEqual([render.expiredAction()]);

    lowConfidence(logOne);
    await handle(text("supino 80x8"));
    await handle(tap("ok:zzzzzz"));
    await handle(tap("lixo"));

    expect(telegramTexts().slice(-2)).toEqual([render.expiredAction(), render.expiredAction()]);
    expect(await validSets(user.id)).toHaveLength(0);
    expect((await chatStateOf(user.id)).pending).toMatchObject({ kind: "confirm" });
  });

  it("quando o usuário digita outra mensagem em vez de tocar, então o passo pendente é abandonado", async () => {
    const user = await linkedUser();
    await createExercise({ name: "Supino reto", aliases: ["supino"] });
    lowConfidence(logOne);
    await handle(text("supino 80x8"));

    openaiState.parsed = { intent: { type: "clarify", reason: "greeting" }, confidence: 1 };
    const result = await handle(text("oi"));

    expect(result).toMatchObject({ status: "clarify", intent: "clarify" });
    expect(telegramTexts().at(-1)).toBe(render.onboardingPrompt());
    expect((await chatStateOf(user.id)).pending).toBeNull();
  });

  it("quando é uma correção ou um 'apagar' incerto, então pergunta com o texto próprio e o botão 'Apagar'", async () => {
    await linkedUser();
    await createExercise({ name: "Supino reto", aliases: ["supino"] });

    lowConfidence({ type: "correct_set", exercise: null, set_number: 2, weight_kg: 85, reps: null });
    await handle(text("a 2ª foi 85"));
    expect(telegramTexts()).toEqual([render.confirmCorrection(null, 2, { weight: 85, reps: null })]);
    expect(lastKeyboard().map((b) => b.text)).toEqual(["✅ Confirmar", "✖️ Cancelar"]);

    lowConfidence({ type: "delete_set", exercise: null, set_number: null });
    await handle(text("apaga"));
    expect(telegramTexts().at(-1)).toBe(render.confirmDelete(null, null));
    expect(lastKeyboard().map((b) => b.text)).toEqual(["✅ Apagar", "✖️ Cancelar"]);
  });
});

describe("bot — 'primeira série do próximo exercício ou série extra?'", () => {
  async function afterFirstExercise() {
    const user = await linkedUser();
    const supino = await createExercise({ name: "Supino reto", aliases: ["supino"] });
    const crucifixo = await createExercise({ name: "Crucifixo" });
    await withRoutine(user.id, [{ title: "Peito", exercises: [[supino, 1], [crucifixo, 2]] }]);
    openaiState.parsed = logIntent("supino", 80, 8, 1);
    await handle(text("supino 80x8"));
    // Só números, logo depois de completar as séries planejadas do supino.
    openaiState.parsed = logIntent("supino", 20, 11, 1, false);
    await handle(text("11x20kg"));
    return { user, supino, crucifixo };
  }

  it("quando manda só números após o último set planejado, então pergunta e não grava", async () => {
    const { user } = await afterFirstExercise();

    expect(telegramTexts().at(-1)).toBe(render.askWhichExercise("Supino reto", "Crucifixo"));
    expect(lastKeyboard().map((b) => b.text)).toEqual(["Crucifixo · 1ª série", "Supino reto · série extra", "✖️ Cancelar"]);
    expect(await validSets(user.id)).toHaveLength(1);
    expect((await chatStateOf(user.id)).pending).toMatchObject({ kind: "pick" });
  });

  it("quando escolhe '1ª série' do próximo, então grava no crucifixo (não extra)", async () => {
    const { user, crucifixo } = await afterFirstExercise();

    await handle(tap(buttonLabeled("Crucifixo").callback_data));

    const sets = await validSets(user.id);
    expect(sets.find((s) => s.exerciseId === crucifixo.id)).toMatchObject({ setPosition: 1, weight: 20, reps: 11, isExtra: false });
    expect(sets).toHaveLength(2);
  });

  it("quando escolhe 'série extra', então grava mais uma série do exercício atual, marcada como extra", async () => {
    const { user, supino } = await afterFirstExercise();

    await handle(tap(buttonLabeled("série extra").callback_data));

    const sets = (await validSets(user.id)).filter((s) => s.exerciseId === supino.id).sort((a, b) => a.setPosition - b.setPosition);
    expect(sets.map((s) => [s.setPosition, s.weight, s.reps, s.isExtra])).toEqual([[1, 80, 8, false], [2, 20, 11, true]]);
  });
});

describe("bot — fim do treino e duração", () => {
  async function openWorkout() {
    const user = await linkedUser();
    const supino = await createExercise({ name: "Supino reto", aliases: ["supino"] });
    const session = await createSession(user.id, { open: true, startedAt: new Date(Date.now() - 50 * 60_000) });
    await createSet(session.id, supino.id, { setPosition: 1, weight: 80, reps: 8 });
    return { user, supino, session };
  }
  /** Sessão já encerrada (60 min) à espera da resposta sobre a duração. */
  async function closedWorkout(pending: Record<string, unknown>) {
    const user = await linkedUser();
    await createExercise({ name: "Supino reto", aliases: ["supino"] });
    const session = await createSession(user.id);
    await setPending(user.id, { ...pending, sessionId: session.id });
    return { user, session };
  }

  it("quando manda /terminei, então fecha a sessão, envia o resumo e pergunta a duração", async () => {
    const { user, session } = await openWorkout();

    const result = await handle(text("/terminei"));

    expect(result).toMatchObject({ status: "processed", kind: "command", command: "terminei" });
    const [summary, ask] = telegramTexts();
    expect(scrub(summary)).toMatchInlineSnapshot(`
      "<b>Treino encerrado</b>

      ⏱️ 50 min · 1 série · ~22 kcal gastas (estimativa)

      <b>Exercícios</b>
      • <b>Supino reto</b>:
        8 reps × 80 kg

      ✏️ <a href="<SITE>/history/<ID>">Revisar e editar este treino no site</a>"
    `);
    expect(ask).toBe(render.confirmDuration(50));
    expect(lastKeyboard().map((b) => b.text)).toEqual(["✅ Confirmar", "✏️ Editar"]);
    const [closed] = await db.select().from(sessions).where(eq(sessions.id, session.id));
    expect(closed).toMatchObject({ closeReason: "user" });
    expect(closed.endedAt).not.toBeNull();
    expect(closed.summarySentAt).not.toBeNull();
    expect((await chatStateOf(user.id)).pending).toMatchObject({ kind: "duration", sessionId: session.id, minutes: 50 });
  });

  it("quando o modelo devolve finish_workout, então o resultado é o mesmo de /terminei", async () => {
    await openWorkout();
    openaiState.parsed = { intent: { type: "finish_workout" }, confidence: 1 };

    const result = await handle(text("terminei"));

    expect(result).toMatchObject({ status: "processed", kind: "message", intent: "finish_workout" });
    expect(telegramTexts()).toHaveLength(2);
    expect(telegramTexts()[1]).toBe(render.confirmDuration(50));
  });

  it("quando manda /terminei sem treino aberto, então avisa que não há treino em andamento", async () => {
    await linkedUser();

    await handle(text("/terminei"));

    expect(telegramTexts()).toEqual([render.noOpenSession()]);
  });

  it("quando confirma a duração, então responde e limpa o passo; a sessão não muda", async () => {
    const { user, session } = await closedWorkout({ kind: "duration", id: "du1", minutes: 60 });
    const before = (await db.select().from(sessions).where(eq(sessions.id, session.id)))[0].endedAt;

    await handle(tap("ok:du1"));

    expect(telegramTexts()).toEqual([render.durationConfirmed(60)]);
    expect((await chatStateOf(user.id)).pending).toBeNull();
    expect((await db.select().from(sessions).where(eq(sessions.id, session.id)))[0].endedAt).toEqual(before);
  });

  it("quando edita a duração, então pede o valor e aceita '1h10' (a sessão passa a durar 70 min)", async () => {
    const { user, session } = await closedWorkout({ kind: "duration", id: "du1", minutes: 60 });

    await handle(tap("ed:du1"));
    expect(telegramTexts()).toEqual([render.askDurationEdit()]);
    expect((await chatStateOf(user.id)).pending).toMatchObject({ kind: "duration_edit", id: "du1", sessionId: session.id });

    await handle(text("1h10"));
    expect(telegramTexts().at(-1)).toBe(render.durationUpdated(70));
    const [updated] = await db.select().from(sessions).where(eq(sessions.id, session.id));
    expect(updated.endedAt!.getTime() - updated.startedAt.getTime()).toBe(70 * 60_000);
    expect((await chatStateOf(user.id)).pending).toBeNull();
  });

  it("quando a duração digitada é curta e inválida, então pede de novo e mantém o passo", async () => {
    const { user } = await closedWorkout({ kind: "duration_edit", id: "du1" });

    await handle(text("abc"));

    expect(telegramTexts()).toEqual([render.askDurationEdit(true)]);
    expect((await chatStateOf(user.id)).pending).toMatchObject({ kind: "duration_edit", id: "du1" });
  });

  it("quando o texto passa de 10 caracteres, então NÃO é tratado como duração: abandona o passo e segue como mensagem normal", async () => {
    const { user } = await closedWorkout({ kind: "duration_edit", id: "du1" });
    openaiState.parsed = logIntent("supino", 80, 8, 3);

    const result = await handle(text("supino 80x8 3 séries"));

    expect(result).toMatchObject({ status: "processed", intent: "log_sets" });
    expect(await validSets(user.id)).toHaveLength(3);
    expect((await chatStateOf(user.id)).pending).toBeNull();
  });

  it("quando toca em 'Cancelar' num passo de duração, então responde 'não está mais disponível' e o passo é apagado", async () => {
    const { user } = await closedWorkout({ kind: "duration", id: "du1", minutes: 60 });

    await handle(tap("no:du1"));

    expect(telegramTexts()).toEqual([render.expiredAction()]);
    expect((await chatStateOf(user.id)).pending).toBeNull();
  });
});

describe("bot — comandos e consultas", () => {
  it("quando manda /start sem rotina, então mostra como montar os treinos; com rotina, mostra a ajuda", async () => {
    const user = await linkedUser();
    await handle(text("/start"));
    expect(telegramTexts()).toEqual([render.onboardingPrompt()]);

    const supino = await createExercise({ name: "Supino reto" });
    await withRoutine(user.id, [{ title: "Peito", exercises: [[supino, 3]] }]);
    await handle(text("/start"));
    expect(telegramTexts().at(-1)).toBe(render.help());
  });

  it("quando manda /ajuda, /help ou um comando desconhecido, então responde a ajuda", async () => {
    await linkedUser();

    for (const command of ["/ajuda", "/help", "/qualquercoisa"]) await handle(text(command));

    expect(telegramTexts()).toEqual([render.help(), render.help(), render.help()]);
  });

  it("quando um comando chega com um passo pendente, então o passo é abandonado", async () => {
    const user = await linkedUser();
    await setPending(user.id, { kind: "confirm", id: "c1", intent: { type: "finish_workout" }, overrides: {} });

    const result = await handle(text("/ajuda"));

    expect(result).toMatchObject({ status: "processed", kind: "command", command: "ajuda" });
    expect((await chatStateOf(user.id)).pending).toBeNull();
  });

  it("quando manda /treino, então mostra o próximo treino da rotina (ou o convite para montar, sem rotina)", async () => {
    const user = await linkedUser();
    await handle(text("/treino"));
    expect(telegramTexts()).toEqual([render.onboardingPrompt()]);

    const supino = await createExercise({ name: "Supino reto" });
    await withRoutine(user.id, [{ title: "Peito", exercises: [[supino, 3]] }]);
    await handle(text("/treino"));
    expect(telegramTexts().at(-1)).toBe(render.nextWorkout({ letter: "A", title: "Peito", exercises: [{ name: "Supino reto", plannedSets: 3, targets: [] }] }));
  });

  it("quando manda /semana ou /relatorio, então responde o resumo dos últimos 7 dias", async () => {
    const user = await linkedUser({ trainingDays: [1, 3, 5] });
    const expected = render.weekReport({ sessions: 0, planned: 3, sets: 0, calories: 0, records: 0 });

    await handle(text("/semana"));
    await handle(text("/relatorio"));

    expect(telegramTexts()).toEqual([expected, expected]);
    expect((await userRow(user.id)).trainingDays).toEqual([1, 3, 5]);
  });

  it("quando o modelo devolve ask_report, então cada escopo responde com seu texto", async () => {
    const user = await linkedUser();
    const supino = await createExercise({ name: "Supino reto", aliases: ["supino"] });
    await withRoutine(user.id, [{ title: "Peito", exercises: [[supino, 3]] }]);
    const next = render.nextWorkout({ letter: "A", title: "Peito", exercises: [{ name: "Supino reto", plannedSets: 3, targets: [] }] });
    const ask = async (parsed: unknown, message: string) => {
      openaiState.parsed = parsed;
      await handle(text(message));
      return telegramTexts().at(-1);
    };

    expect(await ask(reportIntent("next_workout"), "qual o treino de hoje?")).toBe(next);
    expect(await ask(reportIntent("last_workout"), "como foi o último?")).toBe(render.noHistory());
    expect(await ask(reportIntent("exercise", { exercise: "supino" }), "como tá meu supino?")).toBe(render.noHistory());
    expect(await ask(reportIntent("muscle_group"), "calorias por grupo")).toBe(render.muscleGroupReportText([], 7, null));
    expect(await ask(reportIntent("week"), "resumo da semana")).toBe(render.weekReport({ sessions: 0, planned: 0, sets: 0, calories: 0, records: 0 }));
  });
});

describe("bot — escolher o dia do treino", () => {
  async function twoDays() {
    const user = await linkedUser();
    const supino = await createExercise({ name: "Supino reto", aliases: ["supino"] });
    const remada = await createExercise({ name: "Remada curvada", aliases: ["remada"], muscleGroup: "costas" });
    await withRoutine(user.id, [
      { title: "Peito", exercises: [[supino, 3]] },
      { title: "Costas", exercises: [[remada, 3]] },
    ]);
    return { user, supino, remada };
  }
  const chooseDay = (day: string) => (openaiState.parsed = { intent: { type: "choose_day", day }, confidence: 1 });
  const viewB = render.nextWorkout({ letter: "B", title: "Costas", exercises: [{ name: "Remada curvada", plannedSets: 3, targets: [] }] }, "Treino de hoje");

  it("quando pede o treino B, então responde as metas de B e guarda a escolha no estado do chat", async () => {
    const { user } = await twoDays();
    chooseDay("B");

    const result = await handle(text("hoje é treino B"));

    expect(result).toMatchObject({ status: "processed", intent: "choose_day" });
    expect(telegramTexts()).toEqual([viewB]);
    expect((await chatStateOf(user.id)).dayOverride).toMatchObject({ letter: "B" });
  });

  it("quando a primeira série logada vem depois da escolha, então a sessão abre no dia B e a escolha é limpa", async () => {
    const { user } = await twoDays();
    chooseDay("B");
    await handle(text("hoje é treino B"));
    openaiState.parsed = logIntent("remada", 40, 10, 1);

    await handle(text("remada 40x10"));

    const routine = await loadRoutine(user.id);
    const [session] = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(session.dayId).toBe(routine!.days.find((d) => d.letter === "B")!.id);
    expect((await chatStateOf(user.id)).dayOverride ?? null).toBeNull();
  });

  it("quando ask_report/next_workout cita um dia, então também escolhe esse dia", async () => {
    const { user } = await twoDays();
    openaiState.parsed = reportIntent("next_workout", { day: "costas" });

    await handle(text("metas do treino costas"));

    expect(telegramTexts()).toEqual([viewB]);
    expect((await chatStateOf(user.id)).dayOverride).toMatchObject({ letter: "B" });
  });

  it("quando o dia não existe, então lista os treinos; sem rotina, convida a montar", async () => {
    await twoDays();
    chooseDay("Z");
    await handle(text("treino Z"));
    expect(telegramTexts()).toEqual([
      render.unknownDay("Z", [{ letter: "A", title: "Peito" }, { letter: "B", title: "Costas" }]),
    ]);
  });

  it("quando não há rotina, então 'escolher dia' devolve o convite para montar os treinos", async () => {
    await linkedUser();
    chooseDay("A");

    await handle(text("treino A"));

    expect(telegramTexts()).toEqual([render.onboardingPrompt()]);
  });

  it("quando há treino em andamento num dia, então pedir outro dia mostra o treino em andamento e não troca", async () => {
    const { user } = await twoDays();
    openaiState.parsed = logIntent("supino", 80, 8, 1);
    await handle(text("supino 80x8"));
    chooseDay("B");

    await handle(text("treino B"));

    expect(telegramTexts().at(-1)).toBe(
      render.nextWorkout({ letter: "A", title: "Peito", exercises: [{ name: "Supino reto", plannedSets: 3, targets: [{ position: 1, weight: 80, reps: 8 }] }] }, "Treino em andamento"),
    );
    expect((await chatStateOf(user.id)).dayOverride ?? null).toBeNull();
  });
});

describe("bot — corrigir e apagar séries", () => {
  async function twoSets() {
    const user = await linkedUser();
    const supino = await createExercise({ name: "Supino reto", aliases: ["supino"] });
    const session = await createSession(user.id, { open: true });
    await createSet(session.id, supino.id, { setPosition: 1, weight: 80, reps: 8 });
    await createSet(session.id, supino.id, { setPosition: 2, weight: 80, reps: 8 });
    return { user, supino, session };
  }
  const correct = (setNumber: number | null, weight: number | null, reps: number | null) =>
    (openaiState.parsed = { intent: { type: "correct_set", exercise: "supino", set_number: setNumber, weight_kg: weight, reps }, confidence: 1 });
  const remove = (setNumber: number | null) =>
    (openaiState.parsed = { intent: { type: "delete_set", exercise: "supino", set_number: setNumber }, confidence: 1 });

  it("quando corrige a 2ª série, então anula a antiga e cria a nova apontando para ela", async () => {
    const { user } = await twoSets();
    const before = await db.select().from(setEntries);
    const old = before.find((s) => s.setPosition === 2)!;
    correct(2, 85, null);

    await handle(text("a 2ª foi 85"));

    expect(telegramTexts()).toEqual([render.corrected({ name: "Supino reto", setPosition: 2, from: { weight: 80, reps: 8 }, to: { weight: 85, reps: 8 } })]);
    const all = await db.select().from(setEntries);
    expect(all).toHaveLength(3);
    expect(all.find((s) => s.id === old.id)!.voidedAt).not.toBeNull();
    expect(all.find((s) => s.supersedesId === old.id)).toMatchObject({ setPosition: 2, weight: 85, reps: 8, voidedAt: null });
    expect((await validSets(user.id)).map((s) => s.weight).sort()).toEqual([80, 85]);
  });

  it("quando apaga sem dizer o número, então remove a última série do exercício", async () => {
    const { user } = await twoSets();
    remove(null);

    await handle(text("apaga a última"));

    expect(telegramTexts()).toEqual([render.deleted({ name: "Supino reto", setPosition: 2, weight: 80, reps: 8 })]);
    expect((await validSets(user.id)).map((s) => s.setPosition)).toEqual([1]);
  });

  it("quando a série pedida não existe ou não há histórico, então responde 'não achei nenhuma série recente'", async () => {
    const empty = await linkedUser();
    await createExercise({ name: "Supino reto", aliases: ["supino"] });
    correct(1, 90, null);
    await handle(text("a primeira foi 90"));
    remove(null);
    await handle(text("apaga"));
    expect(telegramTexts()).toEqual([render.nothingToCorrect(), render.nothingToCorrect()]);
    expect(await validSets(empty.id)).toHaveLength(0);
  });

  it("quando a série pedida não existe numa sessão com séries, então também responde 'não achei' e nada muda", async () => {
    const { user } = await twoSets();
    correct(5, 90, null);

    await handle(text("a 5ª foi 90"));

    expect(telegramTexts()).toEqual([render.nothingToCorrect()]);
    expect((await validSets(user.id)).map((s) => s.weight)).toEqual([80, 80]);
  });
});

describe("bot — mensagens que não viram intent de escrita", () => {
  it("quando o modelo devolve 'clarify', então a resposta depende do motivo e de haver rotina; status 'clarify'", async () => {
    const user = await linkedUser();
    const clarify = (reason: string) => (openaiState.parsed = { intent: { type: "clarify", reason }, confidence: 1 });

    clarify("greeting");
    expect(await handle(text("oi"))).toMatchObject({ status: "clarify", intent: "clarify" });
    clarify("ambiguous");
    await handle(text("hã?"));
    clarify("help");
    await handle(text("como funciona?"));
    expect(telegramTexts()).toEqual([render.onboardingPrompt(), render.clarify("ambiguous"), render.onboardingPrompt()]);

    const supino = await createExercise({ name: "Supino reto" });
    await withRoutine(user.id, [{ title: "Peito", exercises: [[supino, 3]] }]);
    clarify("greeting");
    await handle(text("oi de novo"));
    clarify("help");
    await handle(text("ajuda?"));
    expect(telegramTexts().slice(-2)).toEqual([render.clarify("greeting"), render.help()]);
  });

  it("quando o modelo devolve carga fora do limite, então vira 'clarify/ambiguous' e nada é gravado", async () => {
    const user = await linkedUser();
    await createExercise({ name: "Supino reto", aliases: ["supino"] });
    openaiState.parsed = logIntent("supino", 2000, 8, 1);

    const result = await handle(text("supino 2000x8"));

    expect(result).toMatchObject({ status: "clarify", intent: "clarify" });
    expect(telegramTexts()).toEqual([render.clarify("ambiguous")]);
    expect(await validSets(user.id)).toHaveLength(0);
  });

  it("quando manda um áudio maior que o limite, então avisa e não há chamada ao modelo", async () => {
    await linkedUser();
    const base = telegramTextUpdate(CHAT, "x");

    const result = await handleRaw({ update_id: base.update_id, message: { ...base.message, text: undefined, voice: { file_id: "f1", duration: MAX_VOICE_SECONDS + 1 } } });

    expect(result).toMatchObject({ status: "ignored", kind: "message" });
    expect(telegramTexts()).toEqual([render.audioTooLong(MAX_VOICE_SECONDS)]);
  });

  it("quando manda algo que não é texto nem áudio (ex.: figurinha), então responde 'só entendo texto e áudio'", async () => {
    await linkedUser();
    const base = telegramTextUpdate(CHAT, "x");

    const result = await handleRaw({ update_id: base.update_id, message: { ...base.message, text: undefined, sticker: { file_id: "s1" } } });

    expect(result).toMatchObject({ status: "ignored", kind: "message" });
    expect(telegramTexts()).toEqual([render.nonText()]);
  });
});

describe("bot — falha ao chamar o modelo (parser e transcrição)", () => {
  const attempt = (isLastAttempt: boolean) => ({ isLastAttempt, log: vi.fn(), report: vi.fn() });
  const run = (update: unknown, o: ReturnType<typeof attempt>) => handleUpdate(update as never, o);
  const today = () => new Date().toISOString().slice(0, 10);
  const voiceUpdate = () => {
    const base = telegramTextUpdate(CHAT, "x");
    return { update_id: base.update_id, message: { ...base.message, text: undefined, voice: { file_id: "f1", duration: 5 } } };
  };
  const statusOf = async (updateId: number) => (await db.select().from(messages).where(eq(messages.updateId, updateId)))[0].status;

  it("quando o parser falha e ainda há tentativas, então o erro sobe (a task refaz) e nada é respondido", async () => {
    await linkedUser();
    const update = text("supino 80x8");
    const o = attempt(false);
    openaiState.error = new Error("boom");

    await expect(run(update, o)).rejects.toThrow("boom");

    expect(telegramTexts()).toEqual([]);
    expect(o.log).not.toHaveBeenCalled();
    expect(o.report).not.toHaveBeenCalled();
    expect(await statusOf(update.update_id)).toBe("received");
  });

  it("quando o parser falha na última tentativa, então avisa 'instabilidade', registra o erro e fecha como 'failed'", async () => {
    const user = await linkedUser();
    const update = text("supino 80x8");
    const o = attempt(true);
    const error = new Error("boom");
    openaiState.error = error;

    const result = await run(update, o);

    expect(result).toEqual({ status: "failed", kind: "message", userId: user.id });
    expect(telegramTexts()).toEqual([render.unavailable()]);
    expect(o.log).toHaveBeenCalledTimes(1);
    expect(o.log).toHaveBeenCalledWith("error", "Parser failed on last attempt", { user_id: user.id });
    expect(o.report).toHaveBeenCalledWith(error);
    expect(await statusOf(update.update_id)).toBe("failed");
  });

  it("quando o orçamento global estoura, então responde mesmo sem ser a última tentativa e não reporta erro", async () => {
    const user = await linkedUser();
    await db.insert(aiUsage).values({ date: today(), requests: 100, costUsd: 5 });
    const update = text("supino 80x8");
    const o = attempt(false);

    const result = await run(update, o);

    expect(result).toEqual({ status: "failed", kind: "message", userId: user.id });
    expect(telegramTexts()).toEqual([render.unavailable()]);
    expect(o.log).toHaveBeenCalledWith("error", "OpenAI daily budget exceeded", { user_id: user.id });
    expect(o.report).not.toHaveBeenCalled();
    expect(await statusOf(update.update_id)).toBe("failed");
  });

  it("quando o orçamento do usuário estoura, então responde 'limite de hoje' e registra o limite por usuário", async () => {
    const user = await linkedUser();
    await db.insert(aiUsageUser).values({ userId: user.id, date: today(), requests: 50, costUsd: 0.25 });
    const o = attempt(false);

    const result = await run(text("supino 80x8"), o);

    expect(result).toEqual({ status: "failed", kind: "message", userId: user.id });
    expect(telegramTexts()).toEqual([render.rateLimited()]);
    expect(o.log).toHaveBeenCalledWith("error", "OpenAI per-user daily budget exceeded", { user_id: user.id });
    expect(o.report).not.toHaveBeenCalled();
  });

  it("quando a transcrição do áudio falha e ainda há tentativas, então o erro sobe e nada é respondido", async () => {
    await linkedUser();
    const update = voiceUpdate();
    const o = attempt(false);

    // O Telegram simulado devolve getFile sem file_path: o download falha.
    await expect(run(update, o)).rejects.toThrow("getFile");

    expect(telegramTexts()).toEqual([]);
    expect(o.log).not.toHaveBeenCalled();
    expect(o.report).not.toHaveBeenCalled();
    expect(await statusOf(update.update_id)).toBe("received");
  });

  it("quando a transcrição falha na última tentativa, então avisa 'instabilidade' e registra 'Transcription failed on last attempt'", async () => {
    const user = await linkedUser();
    const update = voiceUpdate();
    const o = attempt(true);

    const result = await run(update, o);

    expect(result).toEqual({ status: "failed", kind: "message", userId: user.id });
    expect(telegramTexts()).toEqual([render.unavailable()]);
    expect(o.log).toHaveBeenCalledWith("error", "Transcription failed on last attempt", { user_id: user.id });
    expect(o.report).toHaveBeenCalledWith(expect.any(Error));
    expect(await statusOf(update.update_id)).toBe("failed");
  });

  it("quando o orçamento do usuário estoura numa transcrição, então responde 'limite de hoje' sem reportar erro", async () => {
    const user = await linkedUser();
    await db.insert(aiUsageUser).values({ userId: user.id, date: today(), requests: 50, costUsd: 0.25 });
    const o = attempt(false);

    const result = await run(voiceUpdate(), o);

    expect(result).toEqual({ status: "failed", kind: "message", userId: user.id });
    expect(telegramTexts()).toEqual([render.rateLimited()]);
    expect(o.log).toHaveBeenCalledWith("error", "OpenAI per-user daily budget exceeded", { user_id: user.id });
    expect(o.report).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------------------------------

describe("logSets — forma completa do retorno", () => {
  /** Troca os ids aleatórios por <ID> para o snapshot ficar estável. */
  const shape = (result: unknown) => JSON.parse(JSON.stringify(result, (key, value) => (key === "sessionId" ? "<ID>" : value)));

  async function setup(days: { title: string; exercises: [{ id: string }, number][] }[]) {
    const { user } = await createSubscribedUser();
    if (days.length) await withRoutine(user.id, days);
    return { user, routine: await loadRoutine(user.id) };
  }

  it("quando é a 1ª série do dia, então abre a sessão e indica o que falta no mesmo exercício", async () => {
    const supino = await createExercise({ name: "Supino reto" });
    const crucifixo = await createExercise({ name: "Crucifixo" });
    const { user, routine } = await setup([{ title: "Peito", exercises: [[supino, 3], [crucifixo, 2]] }]);

    const result = await logSets(user, routine, [{ exerciseId: supino.id, weight: 80, reps: 8, count: 1 }]);

    expect(shape(result)).toMatchInlineSnapshot(`
      {
        "closedBefore": null,
        "complete": false,
        "items": [
          {
            "isExtra": false,
            "name": "Supino reto",
            "record": null,
            "reps": 8,
            "setPosition": 1,
            "target": {
              "reps": 8,
              "weight": 80,
            },
            "weight": 80,
          },
        ],
        "opened": {
          "letter": "A",
          "title": "Peito",
        },
        "remaining": [
          {
            "missing": 2,
            "name": "Supino reto",
          },
          {
            "missing": 2,
            "name": "Crucifixo",
          },
        ],
        "replay": false,
        "sessionId": "<ID>",
        "upNext": {
          "kind": "same",
          "name": "Supino reto",
          "targets": [
            null,
            null,
          ],
        },
      }
    `);
  });

  it("quando completa as séries planejadas de um exercício, então 'upNext' aponta o próximo exercício", async () => {
    const supino = await createExercise({ name: "Supino reto" });
    const crucifixo = await createExercise({ name: "Crucifixo" });
    const { user, routine } = await setup([{ title: "Peito", exercises: [[supino, 1], [crucifixo, 2]] }]);

    const result = await logSets(user, routine, [{ exerciseId: supino.id, weight: 80, reps: 8, count: 1 }]);

    expect(shape(result)).toMatchInlineSnapshot(`
      {
        "closedBefore": null,
        "complete": false,
        "items": [
          {
            "isExtra": false,
            "name": "Supino reto",
            "record": null,
            "reps": 8,
            "setPosition": 1,
            "target": {
              "reps": 8,
              "weight": 80,
            },
            "weight": 80,
          },
        ],
        "opened": {
          "letter": "A",
          "title": "Peito",
        },
        "remaining": [
          {
            "missing": 2,
            "name": "Crucifixo",
          },
        ],
        "replay": false,
        "sessionId": "<ID>",
        "upNext": {
          "kind": "next",
          "name": "Crucifixo",
          "targets": [
            null,
            null,
          ],
        },
      }
    `);
  });

  it("quando completa todas as séries do dia, então 'complete' é true e não há 'upNext'", async () => {
    const supino = await createExercise({ name: "Supino reto" });
    const { user, routine } = await setup([{ title: "Peito", exercises: [[supino, 2]] }]);

    const result = await logSets(user, routine, [{ exerciseId: supino.id, weight: 80, reps: 8, count: 2 }]);

    expect(shape(result)).toMatchInlineSnapshot(`
      {
        "closedBefore": null,
        "complete": true,
        "items": [
          {
            "isExtra": false,
            "name": "Supino reto",
            "record": null,
            "reps": 8,
            "setPosition": 1,
            "target": {
              "reps": 8,
              "weight": 80,
            },
            "weight": 80,
          },
          {
            "isExtra": false,
            "name": "Supino reto",
            "record": null,
            "reps": 8,
            "setPosition": 2,
            "target": {
              "reps": 8,
              "weight": 80,
            },
            "weight": 80,
          },
        ],
        "opened": {
          "letter": "A",
          "title": "Peito",
        },
        "remaining": [],
        "replay": false,
        "sessionId": "<ID>",
        "upNext": null,
      }
    `);
  });

  it("quando passa das séries planejadas, então a série é extra e não tem meta", async () => {
    const supino = await createExercise({ name: "Supino reto" });
    const { user, routine } = await setup([{ title: "Peito", exercises: [[supino, 1]] }]);

    const result = await logSets(user, routine, [{ exerciseId: supino.id, weight: 80, reps: 8, count: 2 }]);

    expect(shape(result)).toMatchInlineSnapshot(`
      {
        "closedBefore": null,
        "complete": true,
        "items": [
          {
            "isExtra": false,
            "name": "Supino reto",
            "record": null,
            "reps": 8,
            "setPosition": 1,
            "target": {
              "reps": 8,
              "weight": 80,
            },
            "weight": 80,
          },
          {
            "isExtra": true,
            "name": "Supino reto",
            "record": null,
            "reps": 8,
            "setPosition": 2,
            "target": null,
            "weight": 80,
          },
        ],
        "opened": {
          "letter": "A",
          "title": "Peito",
        },
        "remaining": [],
        "replay": false,
        "sessionId": "<ID>",
        "upNext": null,
      }
    `);
  });

  it("quando bate o recorde de carga de um exercício com histórico, então o item vem com 'record'", async () => {
    const supino = await createExercise({ name: "Supino reto" });
    const { user, routine } = await setup([]);
    const previous = await createSession(user.id);
    await createSet(previous.id, supino.id, { setPosition: 1, weight: 70, reps: 8 });

    const result = await logSets(user, routine, [{ exerciseId: supino.id, weight: 80, reps: 8, count: 1 }]);

    expect(shape(result)).toMatchInlineSnapshot(`
      {
        "closedBefore": null,
        "complete": false,
        "items": [
          {
            "isExtra": false,
            "name": "Supino reto",
            "record": "weight",
            "reps": 8,
            "setPosition": 1,
            "target": {
              "reps": 9,
              "weight": 80,
            },
            "weight": 80,
          },
        ],
        "opened": null,
        "remaining": [],
        "replay": false,
        "sessionId": "<ID>",
        "upNext": null,
      }
    `);
  });

  it("quando a carga não é dita, então usa a última carga do exercício (e 0 se nunca fez)", async () => {
    const supino = await createExercise({ name: "Supino reto" });
    const barra = await createExercise({ name: "Barra fixa" });
    const { user, routine } = await setup([]);
    const previous = await createSession(user.id);
    await createSet(previous.id, supino.id, { setPosition: 1, weight: 62.5, reps: 10 });

    const result = await logSets(user, routine, [
      { exerciseId: supino.id, weight: null, reps: 10, count: 1 },
      { exerciseId: barra.id, weight: null, reps: 6, count: 1 },
    ]);

    expect(shape(result)).toMatchInlineSnapshot(`
      {
        "closedBefore": null,
        "complete": false,
        "items": [
          {
            "isExtra": false,
            "name": "Supino reto",
            "record": null,
            "reps": 10,
            "setPosition": 1,
            "target": {
              "reps": 11,
              "weight": 62.5,
            },
            "weight": 62.5,
          },
          {
            "isExtra": false,
            "name": "Barra fixa",
            "record": null,
            "reps": 6,
            "setPosition": 1,
            "target": {
              "reps": 6,
              "weight": 0,
            },
            "weight": 0,
          },
        ],
        "opened": null,
        "remaining": [],
        "replay": false,
        "sessionId": "<ID>",
        "upNext": null,
      }
    `);
  });

  it("quando o mesmo update chega de novo, então devolve {replay: true} e não grava nada", async () => {
    const supino = await createExercise({ name: "Supino reto" });
    const { user, routine } = await setup([]);
    const input = [{ exerciseId: supino.id, weight: 80, reps: 8, count: 1 }];

    const first = await logSets(user, routine, input, new Date(), null, 777);
    const second = await logSets(user, routine, input, new Date(), null, 777);

    expect(first.replay).toBe(false);
    expect(shape(second)).toEqual({ replay: true, closedBefore: null });
    expect(await validSets(user.id)).toHaveLength(1);
  });
});
