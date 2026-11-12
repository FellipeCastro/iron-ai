# Iron AI — Plano de implementação v1

## Context
Iron AI é um assistente de treino no Telegram (registro de séries por texto livre, progressão automática 6→12 reps, lembretes, resumos, relatórios) com um site Next.js (painel, rotina, histórico, gráficos, configurações). A entrevista de alinhamento está concluída (spec e assumptions aprovados). O repo hoje é um `create-next-app` limpo: Next **16.4.3**, React 19.3.0, Tailwind 4, TS, sem nenhuma outra dependência. Convenções do Next 16 a respeitar (AGENTS.md): consultar `node_modules/next/dist/docs/` antes de codar; `proxy.ts` substitui `middleware.ts`.

## Decisões travadas (resumo)
- Site primeiro (Clerk) → deep link `t.me/<bot>?start=<token>` vincula o chat. 1 chat privado por conta, pt-BR, kg.
- Webhook Next.js → task trigger.dev (`concurrencyKey` = userId, `idempotencyKey` = `update_id`).
- LLM só interpreta (Structured Outputs + Zod); progressão, PRs, respostas = código determinístico/templates.
- Meta por série (posição), faixa 6–12 global, rodízio A→B→C sequencial, sessão implícita (fecha: "terminei" / todos concluídos / 90 min inativo).
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
trigger/ handle-message.ts, tick.ts (cron 15min), close-session.ts
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
Status conferido no código em 2026-11-03. `[x]` = implementado no repositório; `[ ]` = pendente ou sem evidência no repositório.

### 1. Fundação
- [x] Instalar as dependências: Clerk, drizzle-orm + drizzle-kit, @neondatabase/serverless, zod, openai, @trigger.dev/sdk, @sentry/nextjs, vitest (framer-motion, lucide-react e shadcn não foram usados; ver "Mudanças em relação ao plano original")
- [x] `proxy.ts` com `clerkMiddleware`
- [x] Sentry e variáveis de ambiente
- [x] Schema e migrações (`drizzle/0000` a `0004`)
- [x] Seed do catálogo pt-BR com aliases (94 exercícios; a estimativa era ~150)

### 2. Motor determinístico (`lib/engine`)
- [x] `nextTarget` (+1 rep; 12 ⇒ carga + incremento, reps = 6; senão mantém) e baseline na 1ª série
- [x] Sessão (abrir, fechar, resumo)
- [x] PRs (maior carga; melhor série na carga)
- [x] Estagnação (3 sessões sem progresso, mín. 4)
- [x] Rodízio do próximo treino
- [x] Recomputação das metas após correção
- [x] Testes unitários de progressão, sessão, recordes, lembretes e duração

### 3. Pipeline do Telegram
- [x] Webhook: valida `X-Telegram-Bot-Api-Secret-Token`, aplica rate limit e enfileira com `idempotencyKey`/`concurrencyKey`
- [x] Task `telegram-handle-update` (`trigger/handle-message.ts`, com a lógica em `lib/bot/handle-update.ts`)
- [x] Onboarding conversacional da rotina
- [x] Parser com `responses.parse` + `zodTextFormat` e união discriminada de intenções
- [x] Baixa confiança ⇒ botões/pergunta sem gravar
- [x] Respostas por templates, callbacks de botões e indicador "digitando"

### 4. Vínculo e site
- [x] Sign-up/sign-in
- [x] "Conectar Telegram" com token de uso único e expiração
- [x] Dashboard (próximo treino, metas, PRs, métricas)
- [x] Rotina (edição), histórico e gráficos por exercício
- [x] Configurações (horário, dias, incremento, fuso)
- [x] Excluir conta (Neon cascade, Clerk `deleteUser` e desvínculo)

### 5. Agendados
- [x] Cron `tick` com lembretes (fuso, dia, horário, sem sessão aberta, `reminder_log` unique)
- [x] Fechamento por inatividade + resumo (`close-inactive-session`)
- [x] Relatórios por exercício/grupo (código, Telegram em texto + link ao site)

### 6. Qualidade e operação
- [x] Sentry sem PII (scrubbing)
- [x] Teto de gasto OpenAI + alerta
- [x] Purge de `messages` > 30 dias (cron diário)
- [x] CI (lint, typecheck, vitest)
- [x] Script de `setWebhook` (`npm run telegram:webhook`)
- [x] Deploy Vercel + trigger.dev Cloud (dev/prod): sem evidência no repositório; confirmar
- [x] Bots separados dev/prod: documentado no README; configuração a confirmar
- [x] Avaliação do parser: `npm run ai:export-golden` (gera `scripts/golden/golden.json` a partir de mensagens reais) e `npm run ai:eval -- [modelo] [--fast]` (acurácia, custo e atalho sem LLM)

### 7. Entregas fora do plano original
**Assinatura (Stripe)**
- [x] Checkout sem teste grátis, planos mensal (R$ 14,90) e anual (R$ 139,90) (`/assinar`, `/assinar/sucesso`)
- [x] Webhook do Stripe sincronizando `subscriptions` e Customer Portal
- [x] Controle de acesso no painel, no bot e nos lembretes (`lib/services/access.ts`)
- [x] Tratamento de risco: disputa, reembolso total e alerta de fraude
- [x] Acesso cortesia para contas anteriores à cobrança (`users.complimentary`)
- [x] Exclusão do customer no Stripe ao excluir a conta

**Bot e IA**
- [x] Atalho de parsing sem LLM (`lib/ai/fast-parse.ts`, `FAST_PATH` off/shadow/on)
- [x] Intenção `delete_set`
- [x] Controle de custo: tetos diários por usuário e para o fallback, limite mensal de mensagens, tabelas `ai_usage` e `ai_usage_user`, preços em `lib/ai/pricing.ts`
- [x] Matching de exercícios por nome/alias (`lib/engine/match.ts`)
- [x] Confirmação e edição da duração do treino
- [x] Onboarding com escolha de dias da semana e horário
- [x] Comandos registrados no bot: `/treino`, `/terminei`, `/semana`, `/ajuda`

**Site**
- [x] Landing page completa (funcionalidades, showcase, preços) e sistema visual próprio
- [x] Lista de exercícios (`/exercises`) e detalhe da sessão (`/history/[id]`)
- [x] Edição e exclusão de séries, e edição da duração, no histórico
- [x] Editor de rotina com arrastar e soltar (`@dnd-kit`) e renomeação de exercícios
- [x] Desconectar Telegram
- [x] Páginas de privacidade e termos
- [x] Open Graph, `robots.txt` e `sitemap`
- [x] Skeletons de carregamento e `global-error`
- [x] Botão de feedback pelo Sentry

**Infra e ferramentas**
- [x] Webhook do Clerk com tasks de sincronização de usuários (`trigger/clerk-users.ts`)
- [x] Rastreamento de ponta a ponta do webhook até as tasks (`lib/trace.ts`, `trigger/init.ts`)
- [x] Script de usuário demo (`npm run db:seed-demo`)
- [x] README com setup local, variáveis de ambiente e operação

### 8. Pendências encontradas na conferência
Todas resolvidas em 2026-11-03.
- [x] `npm run typecheck` passa: o `stripe` instalado agora traz os `.d.ts` (0 erros)
- [x] Criados `scripts/export-golden.ts`, `scripts/eval-parser.ts` e `scripts/golden-shared.ts` (`ai:export-golden` e `ai:eval`)
- [x] Testes de `stagnation.ts` e `reports.ts` (`tests/engine/records.test.ts`): sessão, exercício, estagnação, recordes por exercício e grupo muscular

## Mudanças em relação ao plano original
| Plano | Implementado |
|---|---|
| Grátis + rate limit | Assinatura paga + rate limit |
| 150 msg/dia | 60 msg/dia e 1.000 msg/mês, configuráveis por env |
| Cron a cada 5 min | Cron a cada 15 min, para deixar o Neon dormir entre execuções |
| Recharts via shadcn charts | Gráficos próprios em `components/charts/` |
| shadcn, framer-motion, lucide-react | Não usados; componentes e ícones próprios |
| `app/(marketing)/page.tsx` | `app/page.tsx` |
| `api/account/route.ts` (DELETE) | Server action `deleteAccountAction` |

## Arquivos/padrões existentes a reutilizar
- `app/layout.tsx`, `app/globals.css`, `eslint.config.mjs`, `tsconfig.json` (gerados pelo create-next-app) — estender, não recriar.
- Docs locais: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` e `16-proxy.md`.
- Padrões confirmados: Clerk `clerkMiddleware` em `proxy.ts` e `clerkClient().users.deleteUser`; trigger.dev `task.trigger(payload, {idempotencyKey, concurrencyKey})` e `schedules.task({cron})`; Drizzle `drizzle-orm/neon-http` + `neon()`; OpenAI `zodTextFormat` + `responses.parse`.

## Verificação
Resultado de 2026-11-03 (lint conferido em 2026-11-01 e, desde então, só nos arquivos novos). Os itens em aberto dependem de teste manual ou de ambiente e não têm registro no repositório.
- [x] `npm run lint`: 0 erros, 2 avisos
- [x] `vitest run`: 73 testes passando
- [x] `tsc --noEmit`: 0 erros
- [ ] Local: `next dev` + `npx trigger.dev dev` + túnel (cloudflared/ngrok) com `setWebhook` do bot de dev; fluxo: criar conta → conectar Telegram → montar rotina → "supino 10 reps 20kg" → ver meta 11 reps → "errei, foi 25kg" → "terminei" → resumo → conferir painel/gráfico.
- [ ] Idempotência: reenviar o mesmo `update_id` não duplica séries; cron rodando duas vezes não duplica lembrete.
- [ ] Limites: estourar 60 msg/dia retorna aviso; exclusão de conta zera dados no Neon e remove no Clerk.
- [ ] Mini conjunto de ~60 frases reais para checar o parser (acurácia-alvo ≥95%): as ferramentas existem (`ai:export-golden` e `ai:eval`), falta exportar as mensagens, revisar o `expected` à mão e rodar o eval. O export não guarda o contexto da conversa; preencher `context` nos casos que dependem de séries anteriores.

## Riscos a acompanhar
Latência webhook→resposta; qualidade do parser (eval disponível, ainda sem conjunto revisado); recomputação em cascata após correção; duplicidade de lembrete; versões de libs (confirmar no momento de instalar).
