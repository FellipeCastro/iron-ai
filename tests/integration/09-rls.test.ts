import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";
import { db, users } from "@/db";
import { createUser } from "./helpers/factories";

// F-04: toda tabela do schema `public` precisa ter RLS ligado (negar por padrão a roles sem BYPASSRLS).
// O app conecta como owner, que ignora RLS, então nada muda para ele.
describe("row level security", () => {
  it("está ligado em todas as tabelas do schema public", async () => {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      select c.relname as name, c.relrowsecurity as enabled
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => !r.enabled).map((r) => r.name)).toEqual([]);
  });

  it("o papel do app (owner) continua lendo e escrevendo", async () => {
    const user = await createUser();
    expect(await db.select().from(users)).toMatchObject([{ id: user.id }]);
  });
});
