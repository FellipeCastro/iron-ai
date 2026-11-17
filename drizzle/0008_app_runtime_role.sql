-- F-03: role de runtime do app, sem DDL e sem BYPASSRLS. O `neondb_owner` fica só para migrations.
-- A senha NÃO vive no repositório: depois da migration, defina-a no painel do Neon (ou com
-- `ALTER ROLE app_runtime PASSWORD '...'`) e monte a connection string da role.
-- Esta migration não troca a conexão do app: isso só deve acontecer quando as policies (RLS) existirem.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  -- Role já existente: não altera atributos (no Neon o owner não é superuser e ALTER ROLE falha).
  -- O teste 10-app-runtime-role confere os atributos.
END
$$;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;
