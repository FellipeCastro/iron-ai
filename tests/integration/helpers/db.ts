import { neon } from "@neondatabase/serverless";
import { assertTestDatabase } from "../env";

let tables: string[] | null = null;

/** Apaga todos os dados de todas as tabelas do schema `public` (as migrations ficam no schema `drizzle`). */
export async function truncateAll() {
  // Última linha de defesa: nunca truncar um banco que não seja o de teste.
  assertTestDatabase(process.env.DATABASE_URL, process.env.TEST_DB_HOST);
  const sql = neon(process.env.DATABASE_URL!);
  tables ??= (await sql`select tablename from pg_tables where schemaname = 'public'`).map((r) => r.tablename as string);
  if (!tables.length) return;
  await sql.query(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
}
