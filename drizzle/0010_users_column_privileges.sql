-- N-1: o RLS escolhe LINHAS, não colunas. A policy `users_update_own` deixava a `app_runtime` alterar
-- `complimentary` (pula o paywall), `stripe_customer_id` (aponta a cobrança para outro cliente) e `clerk_id`
-- na própria linha. Só o privilégio de coluna restringe isso: o runtime edita apenas as configurações do usuário.
-- `updated_at` entra porque o Drizzle o grava em todo UPDATE ($onUpdate). INSERT/DELETE em `users` já não
-- têm policy (criação e exclusão são do servidor).
REVOKE UPDATE ON "users" FROM app_runtime;--> statement-breakpoint
GRANT UPDATE ("timezone", "reminder_time", "training_days", "weight_increment_kg", "updated_at") ON "users" TO app_runtime;
