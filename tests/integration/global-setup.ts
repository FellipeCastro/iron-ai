import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { assertTestDatabase, loadTestEnv } from "./env";

// Roda uma vez antes da suíte: confirma que o banco é o de teste e aplica as migrations.
// Usa o migrator do drizzle direto (e não `drizzle-kit migrate`) porque o drizzle-kit lê o `.env`.
export default async function setup() {
  const env = loadTestEnv();
  assertTestDatabase(env.DATABASE_URL, env.TEST_DB_HOST);
  await migrate(drizzle({ client: neon(env.DATABASE_URL) }), { migrationsFolder: "./drizzle" });
}
