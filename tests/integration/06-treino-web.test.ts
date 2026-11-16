import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  addSetAction,
  deleteExerciseFromSessionAction,
  deleteSessionAction,
  deleteSetAction,
  saveRoutineAction,
  saveSettingsAction,
  updateSessionDurationAction,
  updateSetAction,
} from "@/app/(app)/actions";
import { db, exercises, routines, sessions, setEntries, setTargets, users } from "@/db";
import { loadCatalog } from "@/lib/services/routine";
import { createExercise, createSession, createSet, createSubscribedUser } from "./helpers/factories";
import { signIn } from "./helpers/mocks";

const UUID = "00000000-0000-4000-8000-000000000000";
const NOT_SET = "Série não encontrada.";
const NOT_SESSION = "Treino não encontrado.";

const allSets = () => db.select().from(setEntries).orderBy(setEntries.createdAt, setEntries.id);
const allSessions = () => db.select().from(sessions).orderBy(sessions.id);
const validSets = async (sessionId: string) => (await allSets()).filter((s) => s.sessionId === sessionId && !s.voidedAt);

/** Usuário assinante já logado, com um exercício do catálogo, um treino encerrado e uma série. */
async function subscriber() {
  const { user } = await createSubscribedUser("active");
  const exercise = await createExercise();
  const session = await createSession(user.id);
  const set = await createSet(session.id, exercise.id);
  return { user, exercise, session, set, login: () => signIn(user.clerkId) };
}

describe("web: edição de séries e sessões", () => {
  it("quando o usuário edita a própria série, então cria a correção (a antiga fica anulada) e os alvos são recalculados", async () => {
    const a = await subscriber();
    a.login();

    expect(await updateSetAction({ setId: a.set.id, weight: 85, reps: 6 })).toEqual({ ok: true, data: undefined });

    const sets = await allSets();
    expect(sets).toHaveLength(2);
    const old = sets.find((s) => s.id === a.set.id)!;
    const fix = sets.find((s) => s.id !== a.set.id)!;
    expect(old.voidedAt).not.toBeNull();
    expect(fix).toMatchObject({ supersedesId: a.set.id, weight: 85, reps: 6, setPosition: a.set.setPosition, voidedAt: null });
    const targets = await db.select().from(setTargets).where(eq(setTargets.userId, a.user.id));
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((t) => t.sourceEntryId === fix.id)).toBe(true);
  });

  it("quando o usuário A tenta editar, apagar ou adicionar série na sessão/série do usuário B, então recebe 'não encontrada' e nada muda no banco", async () => {
    const a = await subscriber();
    const b = await subscriber();
    a.login();
    const before = { sets: await allSets(), sessions: await allSessions() };

    expect(await updateSetAction({ setId: b.set.id, weight: 1, reps: 1 })).toEqual({ ok: false, error: NOT_SET });
    expect(await deleteSetAction({ setId: b.set.id })).toEqual({ ok: false, error: NOT_SET });
    expect(await addSetAction({ sessionId: b.session.id, exerciseId: b.exercise.id, weight: 10, reps: 5 })).toEqual({
      ok: false,
      error: "Treino ou exercício não encontrado.",
    });
    expect(await deleteExerciseFromSessionAction({ sessionId: b.session.id, exerciseId: b.exercise.id })).toEqual({
      ok: false,
      error: "Exercício não encontrado neste treino.",
    });

    expect({ sets: await allSets(), sessions: await allSessions() }).toEqual(before);
  });

  it("quando A tenta apagar a sessão ou duração de B, então 'não encontrado' e nada muda", async () => {
    const a = await subscriber();
    const b = await subscriber();
    a.login();
    const before = await allSessions();

    expect(await deleteSessionAction({ sessionId: b.session.id })).toEqual({ ok: false, error: NOT_SESSION });
    expect(await updateSessionDurationAction({ sessionId: b.session.id, minutes: 10 })).toEqual({ ok: false, error: NOT_SESSION });

    expect(await allSessions()).toEqual(before);
  });

  it("quando A tenta adicionar série usando exercício personalizado de B, então é recusado", async () => {
    const a = await subscriber();
    const b = await subscriber();
    const custom = await createExercise({ ownerUserId: b.user.id });
    a.login();
    const before = await allSets();

    expect(await addSetAction({ sessionId: a.session.id, exerciseId: custom.id, weight: 10, reps: 5 })).toMatchObject({ ok: false });
    expect(await allSets()).toEqual(before);
  });

  it("quando o usuário adiciona série na própria sessão, então a série é gravada", async () => {
    const a = await subscriber();
    a.login();
    expect(await addSetAction({ sessionId: a.session.id, exerciseId: a.exercise.id, weight: 90, reps: 5 })).toMatchObject({ ok: true });
    expect(await validSets(a.session.id)).toHaveLength(2);
  });

  it("quando o uuid é inválido, então retorna erro de validação sem tocar no banco", async () => {
    const a = await subscriber();
    a.login();
    const before = await allSets();

    expect(await updateSetAction({ setId: "nao-e-uuid", weight: 10, reps: 5 })).toMatchObject({ ok: false });
    expect(await deleteSetAction({ setId: "x" })).toEqual({ ok: false, error: "Série inválida." });
    expect(await addSetAction({ sessionId: "x", exerciseId: UUID, weight: 10, reps: 5 })).toMatchObject({ ok: false });
    expect(await deleteSessionAction({ sessionId: "x" })).toEqual({ ok: false, error: "Treino inválido." });
    expect(await deleteExerciseFromSessionAction({ sessionId: "x", exerciseId: "y" })).toEqual({ ok: false, error: "Exercício inválido." });
    expect(await updateSessionDurationAction({ sessionId: "x", minutes: 30 })).toMatchObject({ ok: false });

    expect(await allSets()).toEqual(before);
  });

  it.each([
    ["weight negativo", { weight: -1, reps: 5 }],
    ["weight > 1000", { weight: 1000.5, reps: 5 }],
    ["reps = 0", { weight: 50, reps: 0 }],
    ["reps negativo", { weight: 50, reps: -3 }],
    ["reps > 100", { weight: 50, reps: 101 }],
    ["reps fracionário", { weight: 50, reps: 2.5 }],
  ])("quando %s, então rejeita (editar e adicionar)", async (_label, values) => {
    const a = await subscriber();
    a.login();
    const before = await allSets();

    expect(await updateSetAction({ setId: a.set.id, ...values })).toMatchObject({ ok: false });
    expect(await addSetAction({ sessionId: a.session.id, exerciseId: a.exercise.id, ...values })).toMatchObject({ ok: false });

    expect(await allSets()).toEqual(before);
  });

  it.each([
    ["weight = 0 (peso corporal)", { weight: 0, reps: 10 }],
    ["weight = 1000 (limite)", { weight: 1000, reps: 10 }],
    ["reps = 1 (limite)", { weight: 50, reps: 1 }],
    ["reps = 100 (limite)", { weight: 50, reps: 100 }],
  ])("quando %s, então aceita", async (_label, values) => {
    const a = await subscriber();
    a.login();
    expect(await updateSetAction({ setId: a.set.id, ...values })).toMatchObject({ ok: true });
    const current = (await validSets(a.session.id))[0];
    expect(current).toMatchObject(values);
  });

  it.each([0, -5, 601, 1.5])("quando a duração é %s, então rejeita", async (minutes) => {
    const a = await subscriber();
    a.login();
    const before = await allSessions();
    expect(await updateSessionDurationAction({ sessionId: a.session.id, minutes })).toEqual({ ok: false, error: "Duração inválida. Use entre 1 e 600 minutos." });
    expect(await allSessions()).toEqual(before);
  });

  it.each([1, 600])("quando a duração é %s (limite), então aceita e a sessão passa a durar isso", async (minutes) => {
    const a = await subscriber();
    a.login();
    expect(await updateSessionDurationAction({ sessionId: a.session.id, minutes })).toMatchObject({ ok: true });
    const [row] = await db.select().from(sessions).where(eq(sessions.id, a.session.id));
    expect(row.endedAt!.getTime() - row.startedAt.getTime()).toBe(minutes * 60_000);
  });

  it("quando a duração é editada numa sessão ainda aberta, então 'não encontrado'", async () => {
    const a = await subscriber();
    const open = await createSession(a.user.id, { open: true });
    a.login();
    expect(await updateSessionDurationAction({ sessionId: open.id, minutes: 30 })).toEqual({ ok: false, error: NOT_SESSION });
    expect((await db.select().from(sessions).where(eq(sessions.id, open.id)))[0].endedAt).toBeNull();
  });

  it("quando o mesmo 'apagar série' é enviado 2 vezes (duplo clique), então a segunda retorna 'não encontrada' e nada quebra", async () => {
    const a = await subscriber();
    const second = await createSet(a.session.id, a.exercise.id, { setPosition: 2 });
    a.login();

    expect(await deleteSetAction({ setId: second.id })).toMatchObject({ ok: true });
    expect(await deleteSetAction({ setId: second.id })).toEqual({ ok: false, error: NOT_SET });
    expect(await validSets(a.session.id)).toHaveLength(1);
  });

  it("quando 2 'apagar exercício' simultâneos chegam para exercícios diferentes, então a sessão é removida só se ficou sem séries e não dá erro", async () => {
    const a = await subscriber();
    const other = await createExercise();
    await createSet(a.session.id, other.id);
    a.login();

    const results = await Promise.allSettled([
      deleteExerciseFromSessionAction({ sessionId: a.session.id, exerciseId: a.exercise.id }),
      deleteExerciseFromSessionAction({ sessionId: a.session.id, exerciseId: other.id }),
    ]);

    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(await allSessions()).toHaveLength(0);
  });

  it("quando 2 'apagar exercício' simultâneos chegam para o mesmo exercício, então a sessão com outras séries continua", async () => {
    const a = await subscriber();
    const other = await createExercise();
    await createSet(a.session.id, other.id);
    a.login();

    const results = await Promise.allSettled([
      deleteExerciseFromSessionAction({ sessionId: a.session.id, exerciseId: a.exercise.id }),
      deleteExerciseFromSessionAction({ sessionId: a.session.id, exerciseId: a.exercise.id }),
    ]);

    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(await allSessions()).toHaveLength(1);
    expect(await validSets(a.session.id)).toHaveLength(1);
  });

  it("quando apago a última série, então a sessão some (sessionEmpty = true)", async () => {
    const a = await subscriber();
    a.login();
    expect(await deleteSetAction({ setId: a.set.id })).toEqual({ ok: true, data: { sessionEmpty: true } });
    expect(await allSessions()).toHaveLength(0);
  });
});

describe("saveRoutineAction", () => {
  const day = (exerciseIds: string[], plannedSets = 3, title = "") => ({ title, exercises: exerciseIds.map((id) => ({ id, plannedSets })) });
  const routineRows = (userId: string) => db.select().from(routines).where(eq(routines.userId, userId)).orderBy(routines.version);
  const INVALID = "Treinos inválidos. Confira os treinos e tente de novo.";

  it("quando a rotina é válida, então salva uma NOVA versão e as sessões antigas continuam apontando para a versão em que foram feitas", async () => {
    const a = await subscriber();
    const ex2 = await createExercise();
    a.login();

    expect(await saveRoutineAction([day([a.exercise.id])])).toMatchObject({ ok: true });
    const [v1] = await routineRows(a.user.id);
    const v1Day = (await db.query.routineDays.findFirst({ where: (d, { eq }) => eq(d.routineId, v1.id) }))!;
    const old = await createSession(a.user.id, { dayId: v1Day.id });

    expect(await saveRoutineAction([day([a.exercise.id, ex2.id], 4)])).toMatchObject({ ok: true });

    const versions = await routineRows(a.user.id);
    expect(versions.map((r) => r.version)).toEqual([1, 2]);
    const [kept] = await db.select().from(sessions).where(eq(sessions.id, old.id));
    expect(kept.dayId).toBe(v1Day.id);
  });

  it("quando usa exercício personalizado de outro usuário, então 'Exercício inválido na rotina' e nada é salvo", async () => {
    const a = await subscriber();
    const b = await subscriber();
    const theirs = await createExercise({ ownerUserId: b.user.id });
    a.login();

    expect(await saveRoutineAction([day([theirs.id])])).toEqual({ ok: false, error: "Exercício inválido na rotina." });
    expect(await routineRows(a.user.id)).toHaveLength(0);
  });

  it.each([
    ["0 dias", () => []],
    ["6 dias", (id: string) => Array.from({ length: 6 }, () => day([id]))],
    ["21 exercícios num dia", (id: string) => [day(Array.from({ length: 21 }, () => id))]],
    ["séries planejadas = 0", (id: string) => [day([id], 0)]],
    ["séries planejadas = 7", (id: string) => [day([id], 7)]],
  ])("quando há %s, então rejeita", async (_label, build) => {
    const a = await subscriber();
    a.login();
    expect(await saveRoutineAction(build(a.exercise.id))).toEqual({ ok: false, error: INVALID });
    expect(await routineRows(a.user.id)).toHaveLength(0);
  });

  it.each([
    ["5 dias", (id: string) => Array.from({ length: 5 }, () => day([id]))],
    ["20 exercícios num dia", (id: string) => [day(Array.from({ length: 20 }, () => id))]],
    ["séries planejadas = 1 e 6", (id: string) => [day([id], 1), day([id], 6)]],
  ])("quando há %s (limite), então aceita", async (_label, build) => {
    const a = await subscriber();
    a.login();
    expect(await saveRoutineAction(build(a.exercise.id))).toMatchObject({ ok: true });
    expect(await routineRows(a.user.id)).toHaveLength(1);
  });

  it("quando 2 salvamentos simultâneos chegam, então não existem 2 versões iguais (unique user+version) e nenhum perde dado silenciosamente", async () => {
    const a = await subscriber();
    a.login();

    const results = await Promise.all([saveRoutineAction([day([a.exercise.id])]), saveRoutineAction([day([a.exercise.id])])]);

    const versions = (await routineRows(a.user.id)).map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);
    // Cada resposta ok corresponde a uma versão gravada; quem perdeu a corrida recebeu um erro explícito.
    expect(versions).toHaveLength(results.filter((r) => r.ok).length);
    for (const r of results.filter((r) => !r.ok)) expect(r.error).toEqual(expect.any(String));
    expect(versions.length).toBeGreaterThan(0);
  });

  it("quando o exercício do catálogo global é renomeado, então o usuário ganha uma cópia própria e o catálogo global não muda para os outros", async () => {
    const a = await subscriber();
    const b = await subscriber();
    const global = await createExercise({ name: "Supino reto" });
    a.login();

    const result = await saveRoutineAction([{ title: "", exercises: [{ id: global.id, plannedSets: 3, name: "Supino do Zé" }] }]);

    expect(result).toMatchObject({ ok: true });
    const copy = (await db.select().from(exercises).where(eq(exercises.ownerUserId, a.user.id)))[0];
    expect(copy).toMatchObject({ name: "Supino do Zé" });
    expect(copy.id).not.toBe(global.id);
    expect((await db.select().from(exercises).where(eq(exercises.id, global.id)))[0].name).toBe("Supino reto");
    const catalogB = (await loadCatalog(b.user.id)).map((e) => e.name);
    expect(catalogB).toContain("Supino reto");
    expect(catalogB).not.toContain("Supino do Zé");
  });
});

describe("saveSettingsAction", () => {
  const valid = { timezone: "America/Sao_Paulo", reminderTime: "07:30", trainingDays: [1, 3, 5], weightIncrementKg: 2.5 };

  it.each([
    ["fuso inexistente", { timezone: "Marte/Base" }],
    ["horário 25:00", { reminderTime: "25:00" }],
    ["horário sem zero (7:30)", { reminderTime: "7:30" }],
    ["horário com minuto 60", { reminderTime: "10:60" }],
    ["dia 0", { trainingDays: [0] }],
    ["dia 8", { trainingDays: [8] }],
    ["incremento 0.2", { weightIncrementKg: 0.2 }],
    ["incremento 10.5", { weightIncrementKg: 10.5 }],
  ])("quando %s, então rejeita e não altera o usuário", async (_label, patch) => {
    const a = await subscriber();
    a.login();
    const before = await db.query.users.findFirst({ where: eq(users.id, a.user.id) });

    expect(await saveSettingsAction({ ...valid, ...patch })).toEqual({ ok: false, error: "Preferências inválidas." });
    expect(await db.query.users.findFirst({ where: eq(users.id, a.user.id) })).toEqual(before);
  });

  it.each([
    ["incremento 0.25 (limite)", { weightIncrementKg: 0.25 }],
    ["incremento 10 (limite)", { weightIncrementKg: 10 }],
    ["sem lembrete", { reminderTime: "" }],
  ])("quando %s, então aceita", async (_label, patch) => {
    const a = await subscriber();
    a.login();
    expect(await saveSettingsAction({ ...valid, ...patch })).toMatchObject({ ok: true });
  });

  it("quando a requisição é válida, então altera só o usuário logado", async () => {
    const a = await subscriber();
    const b = await subscriber();
    a.login();
    const bBefore = await db.query.users.findFirst({ where: eq(users.id, b.user.id) });

    expect(await saveSettingsAction({ timezone: "Europe/Lisbon", reminderTime: "06:15", trainingDays: [5, 1, 5, 3], weightIncrementKg: 1.25 })).toMatchObject({ ok: true });

    const after = await db.query.users.findFirst({ where: eq(users.id, a.user.id) });
    expect(after).toMatchObject({ timezone: "Europe/Lisbon", trainingDays: [1, 3, 5], weightIncrementKg: 1.25 });
    expect(after!.reminderTime).toMatch(/^06:15/);
    expect(await db.query.users.findFirst({ where: eq(users.id, b.user.id) })).toEqual(bBefore);
  });
});
