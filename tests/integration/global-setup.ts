import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { assertTestDatabase, loadTestEnv } from "./env";

// Roda uma vez antes da suíte: confirma que o banco é o de teste e aplica as migrations.
// Usa o migrator do drizzle direto (e não `drizzle-kit migrate`) porque o drizzle-kit lê o `.env`.
export default async function setup() {
  const env = loadTestEnv();
  assertTestDatabase(env.DATABASE_URL, env.TEST_DB_HOST);
  const sql = neon(env.DATABASE_URL);

  // Banco com tabelas mas sem histórico de migrations (criado por `db:push`): o migrator tentaria recriar
  // tudo e quebraria. É a branch de teste, descartável: recria o schema `public` do zero.
  const [{ tables }] = await sql`select count(*)::int as tables from pg_tables where schemaname = 'public'`;
  const [{ journal }] = await sql`select to_regclass('drizzle.__drizzle_migrations') is not null as journal`;
  const applied = journal ? (await sql`select count(*)::int as n from drizzle.__drizzle_migrations`)[0].n : 0;
  if (tables > 0 && applied === 0) {
    await sql`drop schema public cascade`;
    await sql`create schema public`;
  }

  await migrate(drizzle({ client: sql }), { migrationsFolder: "./drizzle" });
}
