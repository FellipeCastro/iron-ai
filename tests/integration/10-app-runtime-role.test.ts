import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

// F-03: a role `app_runtime` (runtime do app) pode ler/escrever dados, mas não altera schema nem ignora RLS.
describe("role app_runtime", () => {
  const sql = () => neon(process.env.DATABASE_URL!);

  it("existe e não tem superuser, BYPASSRLS, CREATEDB nem CREATEROLE", async () => {
    const [role] = await sql()`
      select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolcanlogin from pg_roles where rolname = 'app_runtime'`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false, rolcanlogin: true });
  });

  // N-4: grants = exatamente o que as policies de 0009 liberam. Tabela nova sem entrada aqui falha o teste,
  // forçando a decidir o acesso da role em vez de herdá-lo. `users` só tem UPDATE por coluna (0010).
  const GRANTS: Record<string, string> = {
    users: "S",
    subscriptions: "S",
    telegram_links: "SD",
    link_tokens: "SI",
    messages: "S",
    reminder_log: "S",
    report_log: "S",
    usage_counters: "S",
    ai_usage_user: "S",
    ai_usage: "",
    // Sem acesso para app_runtime de propósito. lib/limits.ts e lib/services/workout.ts ainda os acessam via `db`
    // (DATABASE_URL = owner hoje). Antes de trocar DATABASE_URL para app_runtime, estas operações precisam de uma
    // conexão separada (owner/server role) — não afrouxe este grant para fazer o app funcionar.
    ai_reservations: "",
    applied_updates: "",
    // Idempotência de pagamentos: escritas só do servidor (webhook do Stripe, startCheckoutAction).
    stripe_events: "",
    idempotent_requests: "",
    exercises: "SIUD",
    routines: "SIUD",
    routine_days: "SIUD",
    routine_exercises: "SIUD",
    sessions: "SIUD",
    set_entries: "SIUD",
    set_targets: "SIUD",
  };

  it("tem em cada tabela só os privilégios que as policies usam (sem grants herdados)", async () => {
    const rows = await sql()`
      select c.relname as name,
        has_table_privilege('app_runtime', c.oid, 'SELECT') as s,
        has_table_privilege('app_runtime', c.oid, 'INSERT') as i,
        has_table_privilege('app_runtime', c.oid, 'UPDATE') as u,
        has_table_privilege('app_runtime', c.oid, 'DELETE') as d,
        has_table_privilege('app_runtime', c.oid, 'TRUNCATE') as trunc,
        has_table_privilege('app_runtime', c.oid, 'REFERENCES') as refs,
        has_table_privilege('app_runtime', c.oid, 'TRIGGER') as trig
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`;
    expect(rows.map((r) => r.name).sort()).toEqual(Object.keys(GRANTS).sort());
    for (const r of rows) {
      const got = `${r.s ? "S" : ""}${r.i ? "I" : ""}${r.u ? "U" : ""}${r.d ? "D" : ""}`;
      expect(got, r.name).toBe(GRANTS[r.name as string]);
      expect(r, r.name).toMatchObject({ trunc: false, refs: false, trig: false });
    }
  });

  it("tabelas criadas no futuro não herdam acesso (default privileges)", async () => {
    const [{ n }] = await sql()`
      select count(*)::int as n from pg_default_acl d
      join pg_namespace ns on ns.oid = d.defaclnamespace
      cross join lateral aclexplode(d.defaclacl) a
      join pg_roles r on r.oid = a.grantee
      where ns.nspname = 'public' and d.defaclobjtype = 'r' and r.rolname = 'app_runtime'`;
    expect(n).toBe(0);
  });

  it("users: UPDATE só nas colunas de configuração, nunca nas sensíveis", async () => {
    const rows = await sql()`
      select a.attname as col, has_column_privilege('app_runtime', 'public.users', a.attname, 'UPDATE') as upd
      from pg_attribute a
      where a.attrelid = 'public.users'::regclass and a.attnum > 0 and not a.attisdropped`;
    const writable = rows.filter((r) => r.upd).map((r) => r.col).sort();
    expect(writable).toEqual(["reminder_time", "timezone", "training_days", "updated_at", "weight_increment_kg"]);
  });

  it("não cria objetos em public nem acessa o histórico de migrations", async () => {
    const [priv] = await sql()`
      select has_schema_privilege('app_runtime', 'public', 'CREATE') as create_public,
             has_schema_privilege('app_runtime', 'drizzle', 'USAGE') as use_drizzle`;
    expect(priv).toEqual({ create_public: false, use_drizzle: false });
  });
});
