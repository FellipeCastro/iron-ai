-- F-04 (Migration C): policies por tabela para a role `app_runtime`.
-- Contrato: a conexão define o usuário da requisição com `set_config('app.user_id', '<users.id>', true)`
-- dentro da mesma transação. Sem esse valor, `app_user_id()` é NULL e nenhuma linha passa (negar por padrão).
-- O owner (`neondb_owner`) continua ignorando RLS: estas policies não mudam o app enquanto ele conectar como owner.
-- Tabelas sem policy para uma operação = operação negada à `app_runtime`. `ai_usage` não tem policy alguma.
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_id() TO app_runtime;--> statement-breakpoint

-- users: lê e edita só a própria linha. Sem INSERT/DELETE (criação e exclusão são do servidor).
CREATE POLICY users_select_own ON "users" FOR SELECT TO app_runtime USING (id = app_user_id());--> statement-breakpoint
CREATE POLICY users_update_own ON "users" FOR UPDATE TO app_runtime USING (id = app_user_id()) WITH CHECK (id = app_user_id());--> statement-breakpoint

-- Campos sensíveis: o usuário só lê. Quem escreve é o servidor.
CREATE POLICY subscriptions_select_own ON "subscriptions" FOR SELECT TO app_runtime USING (user_id = app_user_id());--> statement-breakpoint
CREATE POLICY telegram_links_select_own ON "telegram_links" FOR SELECT TO app_runtime USING (user_id = app_user_id());--> statement-breakpoint
CREATE POLICY telegram_links_delete_own ON "telegram_links" FOR DELETE TO app_runtime USING (user_id = app_user_id());--> statement-breakpoint
CREATE POLICY link_tokens_select_own ON "link_tokens" FOR SELECT TO app_runtime USING (user_id = app_user_id());--> statement-breakpoint
CREATE POLICY link_tokens_insert_own ON "link_tokens" FOR INSERT TO app_runtime WITH CHECK (user_id = app_user_id());--> statement-breakpoint
CREATE POLICY messages_select_own ON "messages" FOR SELECT TO app_runtime USING (user_id = app_user_id());--> statement-breakpoint
CREATE POLICY reminder_log_select_own ON "reminder_log" FOR SELECT TO app_runtime USING (user_id = app_user_id());--> statement-breakpoint
CREATE POLICY report_log_select_own ON "report_log" FOR SELECT TO app_runtime USING (user_id = app_user_id());--> statement-breakpoint
CREATE POLICY usage_counters_select_own ON "usage_counters" FOR SELECT TO app_runtime USING (user_id = app_user_id());--> statement-breakpoint
CREATE POLICY ai_usage_user_select_own ON "ai_usage_user" FOR SELECT TO app_runtime USING (user_id = app_user_id());--> statement-breakpoint

-- Dados do usuário: leitura e escrita só nas próprias linhas.
CREATE POLICY routines_own ON "routines" FOR ALL TO app_runtime USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());--> statement-breakpoint
CREATE POLICY sessions_own ON "sessions" FOR ALL TO app_runtime USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());--> statement-breakpoint
CREATE POLICY set_targets_own ON "set_targets" FOR ALL TO app_runtime USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());--> statement-breakpoint

-- Filhas: herdam o escopo da tabela-pai.
CREATE POLICY routine_days_own ON "routine_days" FOR ALL TO app_runtime
  USING (EXISTS (SELECT 1 FROM "routines" r WHERE r.id = routine_id AND r.user_id = app_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM "routines" r WHERE r.id = routine_id AND r.user_id = app_user_id()));--> statement-breakpoint
CREATE POLICY routine_exercises_own ON "routine_exercises" FOR ALL TO app_runtime
  USING (EXISTS (SELECT 1 FROM "routine_days" d JOIN "routines" r ON r.id = d.routine_id WHERE d.id = day_id AND r.user_id = app_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM "routine_days" d JOIN "routines" r ON r.id = d.routine_id WHERE d.id = day_id AND r.user_id = app_user_id()));--> statement-breakpoint
CREATE POLICY set_entries_own ON "set_entries" FOR ALL TO app_runtime
  USING (EXISTS (SELECT 1 FROM "sessions" s WHERE s.id = session_id AND s.user_id = app_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM "sessions" s WHERE s.id = session_id AND s.user_id = app_user_id()));--> statement-breakpoint

-- exercises: o catálogo global (owner_user_id nulo) é legível por todos; o usuário só escreve nos próprios.
CREATE POLICY exercises_select ON "exercises" FOR SELECT TO app_runtime USING (owner_user_id IS NULL OR owner_user_id = app_user_id());--> statement-breakpoint
CREATE POLICY exercises_insert_own ON "exercises" FOR INSERT TO app_runtime WITH CHECK (owner_user_id = app_user_id());--> statement-breakpoint
CREATE POLICY exercises_update_own ON "exercises" FOR UPDATE TO app_runtime USING (owner_user_id = app_user_id()) WITH CHECK (owner_user_id = app_user_id());--> statement-breakpoint
CREATE POLICY exercises_delete_own ON "exercises" FOR DELETE TO app_runtime USING (owner_user_id = app_user_id());
