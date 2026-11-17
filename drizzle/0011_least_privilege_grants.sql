-- N-4: a 0008 deu SELECT/INSERT/UPDATE/DELETE em TODAS as tabelas à `app_runtime` (e nas futuras, por default
-- privileges), deixando só o RLS como barreira. Aqui os grants passam a ser exatamente o que as policies da
-- 0009 liberam: se o RLS de uma tabela for desligado por engano, a role continua sem poder escrever onde não deve.
-- Tabela nova nasce sem acesso; o teste 10-app-runtime-role exige declarar o acesso de cada tabela.
-- (REVOKE em tabela também remove os privilégios de coluna da 0010; `users` é concedida de novo abaixo.)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM app_runtime;--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_runtime;--> statement-breakpoint

-- Só leitura (escrita é do servidor).
GRANT SELECT ON "users", "subscriptions", "messages", "reminder_log", "report_log", "usage_counters", "ai_usage_user" TO app_runtime;--> statement-breakpoint
GRANT UPDATE ("timezone", "reminder_time", "training_days", "weight_increment_kg", "updated_at") ON "users" TO app_runtime;--> statement-breakpoint

-- Leitura + o que a policy permite além disso.
GRANT SELECT, DELETE ON "telegram_links" TO app_runtime;--> statement-breakpoint
GRANT SELECT, INSERT ON "link_tokens" TO app_runtime;--> statement-breakpoint

-- Dados do usuário (policies FOR ALL ou equivalentes).
GRANT SELECT, INSERT, UPDATE, DELETE ON "exercises", "routines", "routine_days", "routine_exercises", "sessions", "set_entries", "set_targets" TO app_runtime;
-- `ai_usage` (gasto global da OpenAI): sem nenhum privilégio, nem leitura.
