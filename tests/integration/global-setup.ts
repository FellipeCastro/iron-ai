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

  // A branch de teste é descartável e compartilhada entre branches do git e o CI: o histórico de migrations dela pode
  // divergir do `_journal.json` atual (migrations regeneradas, execução interrompida, `db:push`). O migrator do drizzle
  // só compara o timestamp da última migration aplicada e tenta recriar tabelas que já existem
  // (`relation "applied_updates" already exists`). Por isso o schema é recriado do zero a cada execução.
  await sql`drop schema if exists drizzle cascade`;
  await sql`drop schema if exists public cascade`;
  await sql`create schema public`;

  await migrate(drizzle({ client: sql }), { migrationsFolder: "./drizzle" });
}
