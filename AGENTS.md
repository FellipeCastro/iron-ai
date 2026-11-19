# Iron AI

Contato de treino no Telegram (registro de séries em texto livre, progressão, lembretes, relatórios) com site Next.js 16 (painel, rotina, histórico, gráficos). Detalhes de produto e setup: `README.md`. Plano histórico: `PLAN.md`.

## Princípio central

O Iron **organiza, não aconselha**. A LLM só **interpreta** a mensagem do usuário. Progressão de carga, recordes, rodízio e respostas são código determinístico e templates pt-BR. Nunca faça o modelo escrever a resposta final nem decidir a carga do próximo treino.

## Mapa do projeto

| Caminho | Papel |
|---|---|
| `app/(app)`, `(auth)`, `(legal)`, `assinar` | Páginas: dashboard, rotina, histórico, exercícios, configurações, login, assinatura, termos |
| `app/api/telegram/webhook`, `app/api/webhooks/{clerk,stripe}` | Webhooks: validam assinatura/secret, registram o id do evento (idempotência) e enfileiram |
| `proxy.ts` | Clerk (no Next 16 substitui `middleware.ts`) |
| `lib/engine/` | Motor puro: progressão, recordes, sessão, rodízio, estagnação, lembretes, relatórios |
| `lib/ai/` | `schemas.ts` (Zod), `parse-message.ts`, `fast-parse.ts` (atalho sem LLM), `prompts.ts`, `pricing.ts` |
| `lib/services/` | Acesso ao banco e regras de negócio (`workout`, `billing`, `routine`, `users`, `access`, `reports`) |
| `lib/telegram/` | `render.ts` (templates pt-BR), `keyboards.ts`, `client.ts`, `state.ts` |
| `lib/bot/handle-update.ts` | Orquestra um update do Telegram |
| `trigger/` | Tasks Trigger.dev: `handle-message`, `tick` (a cada 15 min), `close-session`, `purge` (diário), `clerk-users`, `stripe-events` |
| `db/schema.ts`, `db/seed/`, `drizzle/` | Schema, catálogo de exercícios e migrações |
| `components/{app,charts,landing,brand,legal}` | UI. Gráficos são SVG próprios; drag and drop da rotina usa dnd-kit |
| `tests/{engine,ai}` | Vitest, espelhando `lib/` |
| `scripts/` | Webhook do Telegram, seed demo, avaliação do parser (`ai:eval`, `ai:export-golden`) |

## Regras de arquitetura

- `lib/engine/` é **puro**: sem banco, rede, `process.env` ou `Date.now()` implícito. Mudou lógica ali, atualize `tests/engine/`.
- Toda mensagem enviada ao usuário vem de `lib/telegram/render.ts`, em pt-BR. Sem texto gerado pela LLM.
- A saída da LLM só chega ao banco depois de validada pelo Zod (`lib/ai/schemas.ts`) e cruzada com o catálogo de exercícios (nome e alias). Confiança < 0,7 ou exercício ambíguo: perguntar com botões, sem gravar.
- O log de séries é **imutável**: correção anula a série antiga e grava outra; as metas são recalculadas do histórico. Não use `UPDATE`/`DELETE` em séries.
- Progressão 6→12 (`REP_MIN`/`REP_MAX` em `lib/engine/progression.ts`). Se mudar, atualize README e testes.
- Sessões paradas há 90 min são fechadas pela task `tick`. Lembretes só vão para quem tem assinatura ativa e nenhuma sessão aberta.
- Cada chamada à OpenAI é registrada em `ai_usage` e `ai_usage_user`; respeite os tetos de gasto e limites de mensagens (`lib/limits.ts`).
- Sentry sem PII: não registre texto de mensagens, e-mails nem nomes.
- Pagamentos são idempotentes: webhook do Stripe grava o `event.id` em `stripe_events` antes de agir; chamadas ao Stripe que mudam estado levam `idempotencyKey` derivada de ids internos ou do evento (nunca e-mail/CPF); o checkout aceita Idempotency-Key do cliente (`lib/idempotency.ts`).
- Mudou `db/schema.ts`: rode `npm run db:generate` e comite a migração (o CI roda `db:check`).
- Variáveis de ambiente são lidas via `lib/env.ts` / `db/env.ts`. Documente novas no README.

## Comandos

```bash
npm run lint && npm run typecheck && npm test   # rode antes de concluir; o CI também roda db:check e build
npm run db:setup      # migrações + catálogo
npm run dev           # site; em paralelo: npm run trigger:dev, ngrok http 3000, stripe listen
npm run ai:eval -- <modelo> --fast   # compara modelos com mensagens reais (scripts/golden)
```

## Armadilhas

- O CLI `trigger.dev` e `@trigger.dev/sdk` devem ter a mesma versão (hoje 4.8.1). Atualize `package.json`, o script `trigger:dev` e `.github/workflows/ci.yml` juntos.
- Antes de mexer em tasks, carregue a skill Trigger.dev adequada (ver `CLAUDE.md`).
- Os preços em `lib/pricing.ts` devem bater com os do Stripe.
- `FAST_PATH` aceita `off | shadow | on`; o padrão é `shadow` (o modelo ainda responde e os resultados são comparados).
- Interface e mensagens do bot em pt-BR; comentários e commits seguem o padrão atual do repo.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->
