import { neon } from "@neondatabase/serverless";
import { beforeAll, describe, expect, it } from "vitest";
import { db, exercises, routineDays, routineExercises, routines, sessions, setEntries, setTargets, subscriptions } from "@/db";
import { createUser } from "./helpers/factories";

// F-04 (Migration C): policies da role `app_runtime`. Cada teste roda numa transação como `app_runtime`
// com `app.user_id` definido (o contrato das policies) e tenta ler/escrever linhas de outro usuário.
const sql = () => neon(process.env.DATABASE_URL!);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

/** Executa `queries` numa transação como `app_runtime` agindo como `userId` (null = sem usuário). Retorna o resultado da última. */
async function asApp(userId: string | null, queries: (s: ReturnType<typeof sql>) => Q[]) {
  const s = sql();
  const results = await s.transaction([
    s`select set_config('app.user_id', ${userId ?? ""}, true)`,
    s`set local role app_runtime`,
    ...queries(s),
  ]);
  return results[results.length - 1] as Record<string, unknown>[];
}

/** O mesmo, mas espera que alguma query seja recusada pelo Postgres. */
async function asAppDenied(userId: string | null, queries: (s: ReturnType<typeof sql>) => Q[]) {
  await expect(asApp(userId, queries)).rejects.toThrow(/row-level security|permission denied/i);
}

describe("policies de RLS (app_runtime)", () => {
  let a: Awaited<ReturnType<typeof createUser>>;
  let b: Awaited<ReturnType<typeof createUser>>;
  let routineA: string;
  let dayA: string;
  let sessionA: string;
  let customA: string;
  let catalog: string;

  beforeAll(async () => {
    // O owner precisa poder assumir a role nos testes; idempotente.
    await sql().query(`GRANT app_runtime TO CURRENT_USER`).catch(() => {});
  });

  async function seed() {
    a = await createUser();
    b = await createUser();
    [{ id: routineA }] = await db.insert(routines).values({ userId: a.id, version: 1 }).returning({ id: routines.id });
    [{ id: dayA }] = await db.insert(routineDays).values({ routineId: routineA, letter: "A", position: 1 }).returning({ id: routineDays.id });
    [{ id: catalog }] = await db.insert(exercises).values({ name: "Catálogo X", muscleGroup: "peito" }).returning({ id: exercises.id });
    [{ id: customA }] = await db
      .insert(exercises)
      .values({ name: "Custom A", muscleGroup: "peito", ownerUserId: a.id })
      .returning({ id: exercises.id });
    await db.insert(routineExercises).values({ dayId: dayA, exerciseId: catalog, order: 1, plannedSets: 3 });
    [{ id: sessionA }] = await db.insert(sessions).values({ userId: a.id }).returning({ id: sessions.id });
    await db.insert(setEntries).values({ sessionId: sessionA, exerciseId: catalog, setPosition: 1, weight: 10, reps: 8 });
    await db.insert(setTargets).values({ userId: a.id, exerciseId: catalog, setPosition: 1, weight: 10, reps: 8 });
    await db.insert(subscriptions).values({
      userId: a.id,
      stripeSubscriptionId: `sub_${a.id}`,
      status: "active",
      priceId: "price_x",
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    });
  }

  it("sem app.user_id, nenhuma linha é visível", async () => {
    await seed();
    expect(await asApp(null, (s) => [s`select 1 from users`])).toEqual([]);
    expect(await asApp(null, (s) => [s`select 1 from routines`])).toEqual([]);
    expect(await asApp(null, (s) => [s`select 1 from sessions`])).toEqual([]);
    expect(await asApp(null, (s) => [s`select 1 from set_entries`])).toEqual([]);
    expect(await asApp(null, (s) => [s`select 1 from routine_days`])).toEqual([]);
    expect(await asApp(null, (s) => [s`select 1 from routine_exercises`])).toEqual([]);
    expect(await asApp(null, (s) => [s`select 1 from set_targets`])).toEqual([]);
    expect(await asApp(null, (s) => [s`select 1 from subscriptions`])).toEqual([]);
    // só o catálogo global de exercícios aparece sem usuário
    expect((await asApp(null, (s) => [s`select owner_user_id from exercises`])).every((r) => r.owner_user_id === null)).toBe(true);
  });

  it("cada usuário só enxerga as próprias linhas", async () => {
    await seed();
    expect(await asApp(a.id, (s) => [s`select id from users`])).toEqual([{ id: a.id }]);
    expect(await asApp(b.id, (s) => [s`select id from users`])).toEqual([{ id: b.id }]);
    expect(await asApp(b.id, (s) => [s`select id from routines`])).toEqual([]);
    expect(await asApp(b.id, (s) => [s`select id from routine_days`])).toEqual([]);
    expect(await asApp(b.id, (s) => [s`select id from routine_exercises`])).toEqual([]);
    expect(await asApp(b.id, (s) => [s`select id from sessions`])).toEqual([]);
    expect(await asApp(b.id, (s) => [s`select id from set_entries`])).toEqual([]);
    expect(await asApp(b.id, (s) => [s`select user_id from set_targets`])).toEqual([]);
    expect(await asApp(b.id, (s) => [s`select user_id from subscriptions`])).toEqual([]);
    expect(await asApp(a.id, (s) => [s`select id from routines`])).toEqual([{ id: routineA }]);
    expect(await asApp(a.id, (s) => [s`select id from set_entries`])).toHaveLength(1);
  });

  it("exercises: catálogo global é público, customizado só do dono", async () => {
    await seed();
    const idsB = (await asApp(b.id, (s) => [s`select id from exercises`])).map((r) => r.id);
    expect(idsB).toContain(catalog);
    expect(idsB).not.toContain(customA);
    const idsA = (await asApp(a.id, (s) => [s`select id from exercises`])).map((r) => r.id);
    expect(idsA).toEqual(expect.arrayContaining([catalog, customA]));
  });

  it("não altera nem apaga linhas de outro usuário (0 linhas afetadas)", async () => {
    await seed();
    expect(await asApp(b.id, (s) => [s`update users set timezone = 'UTC' where id = ${a.id} returning id`])).toEqual([]);
    expect(await asApp(b.id, (s) => [s`update routines set version = 9 where id = ${routineA} returning id`])).toEqual([]);
    expect(await asApp(b.id, (s) => [s`delete from sessions where id = ${sessionA} returning id`])).toEqual([]);
    expect(await asApp(b.id, (s) => [s`delete from set_entries where session_id = ${sessionA} returning id`])).toEqual([]);
    expect(await asApp(b.id, (s) => [s`update exercises set name = 'x' where id = ${customA} returning id`])).toEqual([]);
    expect(await asApp(b.id, (s) => [s`delete from exercises where id = ${catalog} returning id`])).toEqual([]);
    expect(await db.select().from(sessions)).toHaveLength(1);
  });

  it("não insere linhas em nome de outro usuário", async () => {
    await seed();
    await asAppDenied(b.id, (s) => [s`insert into routines (user_id, version) values (${a.id}, 2)`]);
    await asAppDenied(b.id, (s) => [s`insert into sessions (user_id) values (${a.id})`]);
    await asAppDenied(b.id, (s) => [s`insert into routine_days (routine_id, letter, position) values (${routineA}, 'B', 2)`]);
    await asAppDenied(b.id, (s) => [s`insert into set_entries (session_id, exercise_id, set_position, weight, reps) values (${sessionA}, ${catalog}, 2, 1, 1)`]);
    await asAppDenied(b.id, (s) => [s`insert into exercises (name, muscle_group, owner_user_id) values ('Fake', 'peito', ${a.id})`]);
    // nem exercício global (owner nulo): catálogo só pelo servidor
    await asAppDenied(b.id, (s) => [s`insert into exercises (name, muscle_group) values ('Fake global', 'peito')`]);
  });

  it("não move uma linha própria para outro usuário", async () => {
    await seed();
    await asAppDenied(a.id, (s) => [s`update routines set user_id = ${b.id} where id = ${routineA}`]);
  });

  it("o próprio usuário escreve nas próprias linhas", async () => {
    await seed();
    expect(await asApp(a.id, (s) => [s`update users set timezone = 'UTC' where id = ${a.id} returning timezone`])).toEqual([{ timezone: "UTC" }]);
    expect(await asApp(a.id, (s) => [s`insert into routine_days (routine_id, letter, position) values (${routineA}, 'B', 2) returning letter`])).toEqual([{ letter: "B" }]);
    expect(await asApp(a.id, (s) => [s`insert into exercises (name, muscle_group, owner_user_id) values ('Meu', 'costas', ${a.id}) returning name`])).toEqual([{ name: "Meu" }]);
  });

  it("subscriptions: usuário lê a sua, mas não escreve (nem a própria)", async () => {
    await seed();
    expect(await asApp(a.id, (s) => [s`select status from subscriptions`])).toEqual([{ status: "active" }]);
    await asAppDenied(a.id, (s) => [s`insert into subscriptions (user_id, stripe_subscription_id, status, price_id, current_period_end) values (${b.id}, 'sub_b', 'active', 'p', now())`]);
    // Sem privilégio de UPDATE/DELETE (N-4): nem chega a avaliar a policy.
    await asAppDenied(a.id, (s) => [s`update subscriptions set status = 'active', current_period_end = now() + interval '10 years' where user_id = ${a.id}`]);
    await asAppDenied(a.id, (s) => [s`delete from subscriptions where user_id = ${a.id}`]);
  });

  // N-1: RLS não restringe colunas; quem restringe é o privilégio de coluna (0010).
  it("users: colunas sensíveis só mudam pelo servidor", async () => {
    await seed();
    await asAppDenied(a.id, (s) => [s`update users set complimentary = true where id = ${a.id}`]);
    await asAppDenied(a.id, (s) => [s`update users set stripe_customer_id = 'cus_OTHER' where id = ${a.id}`]);
    await asAppDenied(a.id, (s) => [s`update users set clerk_id = 'user_changed' where id = ${a.id}`]);
    await asAppDenied(a.id, (s) => [s`update users set id = gen_random_uuid() where id = ${a.id}`]);
    await asAppDenied(a.id, (s) => [s`update users set created_at = now() where id = ${a.id}`]);
  });

  it("users: as colunas de configurações continuam editáveis (inclui updated_at, que o drizzle grava)", async () => {
    await seed();
    const rows = await asApp(a.id, (s) => [
      s`update users set timezone = 'UTC', reminder_time = '07:30', training_days = '{1,3}', weight_increment_kg = 1.25, updated_at = now()
        where id = ${a.id} returning timezone, weight_increment_kg`,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].timezone).toBe("UTC");
  });

  it("users: não cria nem apaga usuários; ai_usage é inacessível", async () => {
    await seed();
    await asAppDenied(a.id, (s) => [s`insert into users (clerk_id) values ('user_fake')`]);
    await asAppDenied(a.id, (s) => [s`delete from users where id = ${a.id}`]);
    // ai_usage: sem nenhum privilégio (N-4), nem leitura.
    await asAppDenied(a.id, (s) => [s`select * from ai_usage`]);
    await asAppDenied(a.id, (s) => [s`insert into ai_usage (date) values (current_date)`]);
  });

  it("tabelas operacionais: só leitura do próprio escopo", async () => {
    await seed();
    await asAppDenied(a.id, (s) => [s`insert into usage_counters (user_id, date, count) values (${a.id}, current_date, 0)`]);
    await asAppDenied(a.id, (s) => [s`insert into ai_usage_user (user_id, date) values (${a.id}, current_date)`]);
    await asAppDenied(a.id, (s) => [s`insert into reminder_log (user_id, date) values (${a.id}, current_date)`]);
    await asAppDenied(a.id, (s) => [s`insert into report_log (user_id, kind, period) values (${a.id}, 'week', current_date)`]);
    await asAppDenied(a.id, (s) => [s`insert into messages (update_id, user_id) values (1, ${a.id})`]);
  });

  it("link_tokens: cria só para si", async () => {
    await seed();
    const future = new Date(Date.now() + 600_000).toISOString();
    expect(await asApp(a.id, (s) => [s`insert into link_tokens (token_hash, user_id, expires_at) values ('h1', ${a.id}, ${future}) returning user_id`])).toEqual([{ user_id: a.id }]);
    await asAppDenied(b.id, (s) => [s`insert into link_tokens (token_hash, user_id, expires_at) values ('h2', ${a.id}, ${future})`]);
    expect(await asApp(b.id, (s) => [s`select 1 from link_tokens`])).toEqual([]);
  });
});
