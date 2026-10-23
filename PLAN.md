# Iron AI — Plano de implementação v1

## Context
Iron AI é um assistente de treino no Telegram (registro de séries por texto livre, progressão automática 8→12 reps, lembretes, resumos, relatórios) com um site Next.js (painel, rotina, histórico, gráficos, configurações). A entrevista de alinhamento está concluída (spec e assumptions aprovados). O repo hoje é um `create-next-app` limpo: Next **16.4.3**, React 19.3.0, Tailwind 4, TS, sem nenhuma outra dependência. Convenções do Next 16 a respeitar (AGENTS.md): consultar `node_modules/next/dist/docs/` antes de codar; `proxy.ts` substitui `middleware.ts`.

## Decisões travadas (resumo)
- Site primeiro (Clerk) → deep link `t.me/<bot>?start=<token>` vincula o chat. 1 chat privado por conta, pt-BR, kg.
- Webhook Next.js → task trigger.dev (`concurrencyKey` = userId, `idempotencyKey` = `update_id`).
- LLM só interpreta (Structured Outputs + Zod); progressão, PRs, respostas = código determinístico/templates.
- Meta por série (posição), faixa 8–12 global, rodízio A→B→C sequencial, sessão implícita (fecha: "terminei" / todos concluídos / 90 min inativo).
- Log imutável de séries com versão válida; exercícios de um catálogo pt-BR com aliases; fora-do-plano registrado como "extra".
- Cron global de 5 min (lembretes + fechamento por inatividade), idempotente por chave.
- Grátis + rate limit (150 msg/dia, ASSUMPTION) + teto global de gasto OpenAI.
- Drizzle + Neon (HTTP driver), Vercel, dev/prod, Sentry sem PII, texto bruto 30 dias, hard delete.
- Data-Driven UI só no site.

## Ajustes à stack informada (a confirmar na aprovação)
- **`zod-to-json-schema` dispensável**: o SDK `openai` já converte Zod via `zodTextFormat` + `openai.responses.parse` (confirmado na doc atual). Só instalar se algum caso fugir disso.
- **"Sanitização de markdown artifacts"** vira desnecessária com Structured Outputs estrito; manter apenas validação Zod pós-parse.
- Modelo OpenAI: id exato e suporte a Structured Outputs serão confirmados na doc no momento de codar a Fase 3 (não fixado aqui); constante única `OPENAI_PARSER_MODEL` + `OPENAI_FALLBACK_MODEL`.

## Estrutura de pastas proposta
```
app/
  (marketing)/page.tsx            landing + CTA
  (auth)/sign-in, sign-up         Clerk
  (app)/dashboard, routine, history, exercises/[id], settings
  api/telegram/webhook/route.ts   valida secret, enqueue
  api/account/route.ts            DELETE conta
proxy.ts                           clerkMiddleware (rotas (app) protegidas; /api/telegram público)
db/ schema.ts, index.ts, seed/exercises.ts
drizzle/                           migrações
trigger/ handle-message.ts, tick.ts (cron 5min), close-session.ts
lib/
  telegram/ client.ts, render.ts (templates pt-BR), keyboards.ts
  ai/ schemas.ts (Zod das ações), parse-message.ts, prompts.ts
  engine/ progression.ts, session.ts, records.ts, stagnation.ts, reports.ts   (puro, sem I/O)
  limits.ts, strings.ts
components/ ui/ (shadcn), charts/, cards/
tests/ engine/*.test.ts
trigger.config.ts, drizzle.config.ts
```

## Modelo de dados (Drizzle / Neon)
- `users` (id, clerk_id unique, timezone, reminder_time, training_days[], weight_increment_kg, created_at)
- `telegram_links` (user_id unique, chat_id unique, linked_at) + `link_tokens` (token hash, user_id, expires_at, used_at)
- `exercises` (catálogo: id, name, muscle_group, aliases[]; `owner_user_id` nullable p/ customizados)
- `routines` (user_id, version) → `routine_days` (letter A/B/C, position) → `routine_exercises` (day_id, exercise_id, order, planned_sets)
- `sessions` (user_id, day_id, started_at, ended_at, close_reason: user|complete|inactive, last_set_at, summary_sent_at)
- `set_entries` (append-only: id, session_id, exercise_id, set_position, weight, reps, is_extra, supersedes_id, voided_at, created_at)
- `set_targets` (user_id, exercise_id, set_position, weight, reps, source_entry_id) — alvo vigente, recalculável do log
- `messages` (update_id unique, user_id, raw_text, parsed_json, status, created_at; purge 30d)
- `reminder_log` (user_id, date, sent_at; unique) · `usage_counters` (user_id, date, count)

## Fases
1. **Fundação**: instalar deps (clerk, drizzle-orm+drizzle-kit, @neondatabase/serverless, zod, openai, @trigger.dev/sdk, @sentry/nextjs, framer-motion, lucide-react, shadcn init, vitest); `proxy.ts` com clerkMiddleware; Sentry; envs; schema + migração + seed do catálogo (~150 exercícios).
2. **Motor determinístico** (`lib/engine`, puro e testado): `nextTarget(set, hit)` (+1 rep; 12 ⇒ carga+incremento, reps=8; senão mantém), baseline na 1ª série, sessão (abrir/fechar/resumo), PRs (maior carga; melhor série na carga), estagnação (3 sessões sem progresso, mín. 4), rodízio do próximo treino, recomputação por exercício após correção. Testes unitários (vitest) cobrem as regras e bordas (série extra, carga maior com menos reps, correção em cascata).
3. **Pipeline do Telegram**: webhook (valida `X-Telegram-Bot-Api-Secret-Token`, rate limit, enqueue com idempotencyKey/concurrencyKey) → task `handle-message`: onboarding conversacional da rotina, parser (`responses.parse` + `zodTextFormat`, união discriminada: `log_sets | correct_set | finish_workout | ask_report | setup_routine | clarify`), baixa confiança ⇒ botões/pergunta sem gravar, aplica engine, responde por templates; callbacks de botões; indicador "digitando".
4. **Vínculo e site**: sign-up/sign-in; "Conectar Telegram" (token de uso único com expiração); dashboard (próximo treino, metas, PRs, métricas), rotina (editar), histórico, gráficos por exercício (Recharts via shadcn charts, dados tipados Zod), configurações (horário, dias, incremento, fuso), excluir conta (Neon cascade + Clerk `deleteUser` + desvincular).
5. **Agendados**: `schedules.task` cron a cada 5 min — lembretes (fuso, dia, horário, sem sessão aberta, `reminder_log` unique) e fechamento por inatividade + resumo; relatórios por exercício/grupo (código, Telegram em texto + link ao site).
6. **Qualidade e operação**: Sentry sem PII (scrubbing), teto de gasto OpenAI + alerta, purge de `messages` > 30 dias (cron diário), CI (lint, typecheck, vitest), deploy Vercel + trigger.dev Cloud (dev/prod), bots separados dev/prod, setWebhook script.

## Arquivos/padrões existentes a reutilizar
- `app/layout.tsx`, `app/globals.css`, `eslint.config.mjs`, `tsconfig.json` (gerados pelo create-next-app) — estender, não recriar.
- Docs locais: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` e `16-proxy.md`.
- Padrões confirmados: Clerk `clerkMiddleware` em `proxy.ts` e `clerkClient().users.deleteUser`; trigger.dev `task.trigger(payload, {idempotencyKey, concurrencyKey})` e `schedules.task({cron})`; Drizzle `drizzle-orm/neon-http` + `neon()`; OpenAI `zodTextFormat` + `responses.parse`.

## Verificação
- `npm run lint`, `tsc --noEmit`, `vitest run` (motor) limpos.
- Local: `next dev` + `npx trigger.dev dev` + túnel (cloudflared/ngrok) com `setWebhook` do bot de dev; fluxo: criar conta → conectar Telegram → montar rotina → "supino 10 reps 20kg" → ver meta 11 reps → "errei, foi 25kg" → "terminei" → resumo → conferir painel/gráfico.
- Idempotência: reenviar o mesmo `update_id` não duplica séries; cron rodando duas vezes não duplica lembrete.
- Limites: estourar 150 msg/dia retorna aviso; exclusão de conta zera dados no Neon e remove no Clerk.
- Mini conjunto de ~60 frases reais para checar manualmente o parser (acurácia-alvo ≥95%), conforme risco aberto.

## Riscos a acompanhar
Latência webhook→resposta; qualidade do parser sem eval automatizado; recomputação em cascata após correção; duplicidade de lembrete; versões de libs (confirmar no momento de instalar).
