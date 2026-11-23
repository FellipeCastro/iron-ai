# Auditoria — iron-ai

Data: 2026-11-23 · Branch: `refactor/separation-of-responsabilities` (commit `222d17f`)
Escopo: só leitura do código e comandos de leitura. Nenhum arquivo do projeto foi alterado além deste relatório. Nada de migration nem instalação.

Stack: Next.js 16 (App Router + Server Actions), Clerk (auth), Stripe (cobrança), Neon Postgres + Drizzle (`neon-http`), Trigger.dev (filas/crons), Telegram (bot), OpenAI (parser).
**Não é Supabase.** O banco não fica exposto por uma API pública tipo PostgREST: o app fala com ele só pelo servidor. Se o *Data API* do Neon está ligado no painel não dá para ver pelo código: **não verificado**.

---

## Os 5 achados de maior risco

| # | Achado | Risco | Onde |
|---|--------|-------|------|
| 1 | Checkout concorrente com chaves de idempotência diferentes. **Hoje está mitigado:** os checkouts de um usuário rodam um por vez (lease em `checkout_slots`), a chave do Stripe vem da geração da linha, a Session aberta do mesmo plano é reusada e todas as outras são expiradas (se uma for paga durante a limpeza, o fluxo vai para o painel). Se mesmo assim surgirem 2 assinaturas vivas, a task `stripe-event` cancela a mais nova, estorna a fatura dela e alerta no Sentry, com a limpeza gravada antes do cancelamento para o retry terminar. **Resta, sem teste:** a tomada do lease enquanto o antecessor ainda cria a Session (só acontece se uma requisição segurar o lease por mais de 30 s, ex.: Stripe lento). | Baixo | `lib/services/billing.ts` (`createCheckoutUrl`, `openCheckout`), `lib/subscription-sync.ts` (`cancelDuplicateSubscriptions`), `trigger/stripe-events.ts` |
| 2 | O RLS está ligado e as policies estão corretas, mas **no banco de teste o app conecta como owner, que ignora o RLS**. Nenhum código define `app.user_id`. Onde a conexão for owner, as policies não protegem nada, e o comentário do CI diz o contrário. Se produção também ignora o RLS: **não verificado**. | Médio | `db/client.ts:9`, `tests/integration/10-app-runtime-role.test.ts:27-28`, `.github/workflows/ci.yml:84` |
| 3 | **Os testes unitários não rodam nesta máquina.** `npm test` falha nos 13 arquivos antes de executar qualquer teste (`TypeError: Cannot read properties of undefined (reading 'config')`). | Médio | `vitest.config.ts`, ambiente Node 24.16 + vitest 5.0.5 (Windows) |
| 4 | `past_due` dá acesso **sem limite de tempo**: ele não passa pela checagem de `current_period_end`. O tempo de acesso depende só de quanto o Stripe mantém a assinatura em `past_due`, e essa configuração de cobrança não está no código. | Médio | `lib/services/access.ts:8-19` |
| 5 | A reserva de orçamento da OpenAI usa 3 statements separados, não uma operação atômica. Rajadas concorrentes passam do teto em até N × estimativa, e uma queda do processo entre os statements prende a reserva sem registro para liberar. | Baixo/Médio | `lib/limits.ts:133-163` |

---

## 1. Testes de integração

**Ferramenta:** Vitest 5.0.5 com duas configs:
- `vitest.config.ts`: unitários (`tests/**`, exceto `tests/integration/**`).
- `vitest.integration.config.ts`: banco real, serviços externos simulados (Clerk, Stripe client, Trigger, OpenAI, Sentry, `fetch`). A verificação de assinatura dos webhooks roda de verdade.

**Banco de teste separado:** sim. É uma branch de teste do Neon, lida **só** de `.env.test` (o `.env` nunca é carregado). Há trava dupla: `assertTestDatabase` em `tests/integration/global-setup.ts` e em `tests/integration/setup.ts` (antes de cada teste) exige `DATABASE_URL` == `TEST_DB_HOST` e recusa o host se ele aparecer em qualquer `.env*` de dev ou produção, inclusive em linha comentada (`tests/integration/env.ts`). A trava tem teste próprio (`tests/test-db-guard.test.ts`). No CI, o job de integração roda com `concurrency: integration-db` e só depois vêm `migrate-prod` e o deploy.

**Comandos:** `npm test` (unitários), `npm run test:integration` (integração) e `npm run test:all` (os dois).

**Resultado da execução:**
- `npm test` (unitários): **0 passam, 13 arquivos falham** no carregamento, antes de rodar qualquer teste. O erro é `TypeError: Cannot read properties of undefined (reading 'config')` na linha do `describe`, com Node v24.16.0 e vitest 5.0.5 no Windows. O CI usa Node 22. Se passa lá: **não verificado**.
- `npm run test:integration`: **não verificado.** Não rodei porque a auditoria ficou em modo de leitura, e a suíte apaga e recria o schema do banco de teste (`drop schema public cascade`) e leva de 15 a 20 min segundo `tests/BUGS.md`. A trava protege produção. Para rodar: `npm run test:integration`. Segundo `tests/BUGS.md`, as últimas execuções registradas passaram, com 2 testes intermitentes conhecidos (S6 e S7).

**Fluxos críticos:**

| Fluxo | Cobertura | Arquivo de teste |
|-------|-----------|------------------|
| Cadastro (webhook Clerk → usuário) | **Rota real** `POST /api/webhooks/clerk` com assinatura Svix real. As tasks `clerk-user-*` rodam no banco real. | `01-cadastro.test.ts` |
| Login | **Só mock.** O login é hospedado pela Clerk e `auth()` é simulado. Cobre só a proteção das rotas e actions sem sessão. É aceitável por ser de terceiro. | `tests/route-auth.test.ts` (unitário), `02-acesso.test.ts` |
| Checkout | **Action chamada direto** (`startCheckoutAction`, banco real, Stripe simulado), mais a **rota real** `GET /assinar/sucesso`. Inclui clique duplo, mesma chave concorrente e chaves diferentes ao mesmo tempo (2 e 3 abas), reuso/expiração de Sessions, Session gravada já paga e 500 guardado pelo Stripe. **Não cobre** a tomada do lease com o antecessor ainda criando (achado #1). | `03-checkout.test.ts`, `14-idempotencia-pagamentos.test.ts` |
| Assinatura / webhook Stripe | **Rota real** `POST /api/webhooks/stripe` com assinatura real sobre o corpo bruto, corpo adulterado, evento duplicado, concorrente e fora de ordem, disputa e reembolso. A task `stripe-event` roda no banco real. | `04-webhook-stripe.test.ts`, `14-idempotencia-pagamentos.test.ts` |
| Webhook Telegram e bot | **Rota real** `POST /api/telegram/webhook` e `handleUpdate` no banco real (cota, redelivery, acesso, orçamento de IA). | `07`, `08`, `13`, `15` |
| Portal de cobrança e exclusão de conta | **Action chamada direto** (banco real, Stripe e Clerk simulados). | `05-portal-e-exclusao.test.ts` |
| Isolamento entre usuários / RLS | Banco real (policies testadas como `app_runtime`). | `06`, `09`, `10`, `11`, `12` |
| Crons `purge`, `reports`, `release-reservations` e lembretes do `tick` | **Sem teste.** Só `closeIdleSessions` (do `tick`) e `close-session` são testados. A lógica pura de lembretes e relatórios tem teste unitário em `tests/engine/`. | — |

| Achado | Risco | Arquivo e linha | Correção sugerida |
|--------|-------|-----------------|-------------------|
| Testes unitários não carregam localmente (13/13 falham com erro de ambiente). | Médio | `vitest.config.ts`, `package.json` (`vitest ^5.0.5`) | Reproduzir com Node 22 (o do CI). Se passar, fixar o Node em `engines`/`.nvmrc`. Se não, investigar a incompatibilidade do vitest 5 com o alias `@`/Windows. |
| A tomada do lease de checkout com o antecessor ainda vivo não tem teste (o caso "2 abas, chaves diferentes" já tem). | Baixo | `tests/integration/14-idempotencia-pagamentos.test.ts` | Teste com o lease envelhecido enquanto a 1ª requisição está parada no `checkout.sessions.create`: no fim, no máximo 1 Session aberta. |
| Crons `purge`, `reports`, `release-reservations` e lembrete sem teste de integração. | Baixo | `trigger/purge.ts`, `trigger/reports.ts`, `trigger/release-reservations.ts`, `trigger/tick.ts` | Testar o `run` de cada task no banco de teste (como já é feito com `closeIdleSessions`). |
| Testes intermitentes conhecidos (vazamento de resposta do bot entre testes). | Baixo | `tests/BUGS.md` (S6, S7, S8) | No `beforeEach`, aguardar o trabalho pendente do teste anterior antes do `TRUNCATE`. |
| Server Actions são testadas chamando a função, não por HTTP. | Baixo | `tests/integration/02-acesso.test.ts` e outros | Aceitável. O `auth.protect()` é exercido. Opcional: um teste e2e do POST da action. |

---

## 2. Confiança no cliente

**Regras só no front:** nenhuma encontrada.
- O preço cobrado vem do servidor: `priceId(plan)` lê `STRIPE_PRICE_*` (`lib/services/billing.ts:357`). O valor exibido (`lib/pricing.ts`, usado em `components/app/plan-picker.tsx`) só serve para mostrar, e `tests/stripe-prices.test.ts` confere os dois.
- O plano é validado com `z.enum(["monthly","annual"])` (`app/(app)/actions.ts:238-244`).
- Cada action resolve o próprio usuário e checa a assinatura (`app/(app)/actions.ts:32-35`). O bot checa também (`lib/bot/handle-update.ts:95,138`).
- Não existe papel de admin. `complimentary` só é lido no servidor (`lib/services/access.ts`) e o cliente não pode gravá-lo (a 0010 restringe a coluna).
- O `/assinar/sucesso` só sincroniza se o `session_id` for do cliente Stripe do próprio usuário (`app/assinar/sucesso/route.ts:25`).

**Variáveis que vão ao navegador:**

| Variável | Classificação |
|----------|---------------|
| `NEXT_PUBLIC_SITE_URL` | Pública por design |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Pública por design (chave publicável) |
| `NEXT_PUBLIC_SENTRY_DSN` | Pública por design (DSN só permite enviar eventos) |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Pública por design |
| `GOOGLE_ANALYTICS_ID`, `GOOGLE_SITE_VERIFICATION` (sem prefixo, mas vão para o HTML em `app/layout.tsx:52,65`) | Públicas por design |

Segredos (`CLERK_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TELEGRAM_*`, `OPENAI_API_KEY`, `SENTRY_AUTH_TOKEN`, `DATABASE_URL`, `TRIGGER_SECRET_KEY`) só são lidos no servidor e nenhum tem prefixo público. `.env*` está no `.gitignore` (linha 34).

**RLS (Postgres/Neon):** ligado nas 21 tabelas (`drizzle/0007`, `0016`, `0017`, `0019`), e o teste `09-rls` confere. Nenhuma policy usa `USING (true)` ou `WITH CHECK (true)`. O papel de `auth.uid()` fica com `app_user_id()`, que lê `current_setting('app.user_id')` e devolve NULL quando o valor não foi definido, negando tudo.

O que cada policy faz (`drizzle/0009_rls_policies.sql`, todas só para a role `app_runtime`):
- `users_select_own` / `users_update_own`: o usuário lê e edita só a própria linha. Sem INSERT e sem DELETE. A 0010/0011 restringe o UPDATE às colunas de configuração (`timezone`, `reminder_time`, `training_days`, `weight_increment_kg`, `updated_at`): `complimentary`, `stripe_customer_id` e `clerk_id` ficam de fora.
- `subscriptions_select_own`: lê só a própria assinatura. Não escreve, nem na própria.
- `telegram_links_select_own` / `_delete_own`: lê e desvincula só o próprio chat. Não cria vínculo (isso é do servidor).
- `link_tokens_select_own` / `_insert_own`: lê e cria tokens só em nome próprio.
- `messages_`, `reminder_log_`, `report_log_`, `usage_counters_`, `ai_usage_user_select_own`: só leitura das próprias linhas.
- `routines_own`, `sessions_own`, `set_targets_own`: leitura e escrita só das próprias linhas. O `WITH CHECK` impede gravar ou mover uma linha para outro usuário.
- `routine_days_own`, `routine_exercises_own`, `set_entries_own`: as tabelas filhas herdam o dono da tabela pai por `EXISTS` (dia → rotina → usuário; série → sessão → usuário).
- `exercises_select`: lê o catálogo global (`owner_user_id IS NULL`) e os próprios exercícios. É permissiva **de propósito**: o catálogo é público. `exercises_insert/update/delete_own`: escreve só nos próprios.
- `ai_usage`, `stripe_events`, `idempotent_requests`, `applied_updates`, `ai_reservations`: sem policy e sem grant. A `app_runtime` não acessa.

| Achado | Risco | Arquivo e linha | Correção sugerida |
|--------|-------|-----------------|-------------------|
| **Observado no banco de teste** (branch Neon de `.env.test`): a suíte de integração conecta como owner, que ignora o RLS (lê e trunca tabelas sem grant para `app_runtime`; o teste 10 anota "DATABASE_URL = owner hoje"). Nenhum código faz `set_config('app.user_id', …)`, então, onde a conexão for owner, as policies não têm efeito e são só defesa futura. **Produção: não verificado** se ignora o RLS: depende da role da `DATABASE_URL` na Vercel, que não foi conferida. | Médio | `db/client.ts:9`, `tests/integration/10-app-runtime-role.test.ts:27-28` | Trocar `DATABASE_URL` para a role `app_runtime` e definir `app.user_id` por requisição dentro de `db.batch` (transação). As operações de servidor (limits, workout) ficam numa conexão separada, como o teste 10 já anota. Enquanto isso, corrigir a documentação. |
| O comentário do CI diz "o app usa o role restrito app_runtime", o que contradiz o código. Qual role produção usa de fato: **não verificado** (depende do valor de `DATABASE_URL` na Vercel). | Médio | `.github/workflows/ci.yml:84`, `drizzle.config.ts:5-6` | Conferir a role da `DATABASE_URL` de produção e alinhar o comentário. |
| Strings `whsec_…` no histórico do git (`ci.yml` e `backend/src/backend/tests/conftest.py` da versão Python; commits `45250e0`, `b20567d`, `47175c6`). Pelo contexto parecem placeholders de teste. **Não verificado** se são segredos reais (não decodifiquei). | Baixo | histórico do git | Confirmar que não batem com o `CLERK_WEBHOOK_SIGNING_SECRET` real. Na dúvida, rotacionar no painel da Clerk. |
| Neon Data API (exposição HTTP do banco): **não verificado**. | Baixo | painel do Neon | Confirmar que está desligado. Se for ligado, o RLS vira a única barreira e o achado acima sobe para alto. |

---

## 3. Race condition

Trechos que leem, decidem e gravam sobre recurso limitado:

| Recurso / trecho | Duas requisições iguais ao mesmo tempo | Proteção no banco | Risco |
|------------------|----------------------------------------|-------------------|-------|
| **Checkout (Session pagável)**, `lib/services/billing.ts` (`createCheckoutUrl`) | Mesma chave: o `runOnce` serializa. **Chaves diferentes:** o lease por usuário em `checkout_slots` faz a 2ª esperar; ela vê a Session da 1ª e a reusa (mesmo plano) ou a expira antes de abrir a sua. A chave do Stripe é a geração da linha, então quem perde o lease e quem assume compartilham a chave. Se 2 assinaturas vivas surgirem mesmo assim, a task `stripe-event` cancela e estorna a mais nova e alerta. Não testado: a tomada com o antecessor ainda criando (lease > 30 s). | Lease por usuário (UPDATE condicional) + chave por geração + limpeza gravada em `duplicate_cleanups` | Baixo |
| Cliente Stripe, `billing.ts:264-283` | Mesma chave `customer-${id}` no Stripe (24 h). Depois disso, o `UPDATE … WHERE stripe_customer_id IS NULL` mantém o primeiro e o segundo vira órfão no Stripe. | Atômica (UPDATE condicional) + unique `stripe_customer_id` | Baixo |
| Sync de assinatura, `lib/subscription-sync.ts:133-221` | Compare-and-swap em `synced_from`. O perdedor relê o Stripe. Insert concorrente cai na unique e repete. | Atômica + unique `stripe_subscription_id`/`user_id` | Baixo |
| Token de vínculo do Telegram, `lib/services/users.ts:60-84` | `UPDATE … WHERE used_at IS NULL AND expires_at > now()`: só uma vence. O chat já ocupado é barrado pela unique `chat_id`. | Atômica + unique | Baixo |
| Cota de mensagens, `lib/limits.ts:40-75` | Advisory lock por usuário + row lock em `messages`, tudo numa transação (`db.batch`). Redelivery não conta de novo. | Lock de linha / advisory lock transacional | Baixo |
| Orçamento OpenAI, `lib/limits.ts:133-163` | O `setWhere cost < teto` é atômico por linha, mas checa antes de somar: N chamadas simultâneas passam com o custo logo abaixo do teto (estouro de até N × estimativa). Global e usuário são 2 statements, e a linha `ai_reservations` é um 3º: uma queda no meio prende o valor sem registro (o próprio código documenta). | Parcial | Baixo/Médio |
| Sessão de treino aberta | Duas mensagens sem sessão aberta tentam abrir duas sessões. | Unique parcial `sessions_one_open_uq` (`db/schema.ts:245`) | Baixo |
| Séries do bot (mesmo update) e correções | Repetição do mesmo `update_id` não duplica séries. Duas correções da mesma série não duplicam. | Unique `set_entries_source_uq`, `set_entries_supersedes_uq` (`db/schema.ts:277,280`) e `applied_updates` | Baixo |
| Apagar a última série enquanto outra é adicionada, `lib/services/workout/sessions.ts:38-53` | `SELECT … FOR UPDATE` e `DELETE … WHERE NOT EXISTS` na mesma transação. | Lock de linha | Baixo |
| Versão da rotina, `lib/services/routine.ts:109-114` | Dois saves calculam a mesma versão e o segundo falha na unique (erro, não corrupção). | Unique `routines_user_version_uq` | Baixo |
| Rename de exercício, `routine.ts:130-172` | Violação da unique owner+name é tratada como "já existe". | Unique `exercises_owner_name_uq` | Baixo |
| Fechar sessão, `sessions.ts:59-69` | `UPDATE … WHERE ended_at IS NULL`: só um fecha. | Atômica | Baixo |
| Alerta diário de gasto, `limits.ts:291-298` | `UPDATE … WHERE alerted_at IS NULL`: o alerta sai uma vez. | Atômica | Baixo |

**Lock em memória, Redis ou cache:** nenhuma proteção depende disso. A única fora do banco é o `concurrencyLimit` do Trigger.dev (`perKey: 1` em `trigger/stripe-events.ts:24`, `trigger/clerk-users.ts:11` e na fila do bot). Mesmo ele é reforço: o banco resolve sozinho (PK de `stripe_events`, compare-and-swap, uniques).

| Achado | Risco | Arquivo e linha | Correção sugerida |
|--------|-------|-----------------|-------------------|
| Tomada do lease de checkout com o antecessor ainda criando a Session: sem teste. O desenho (chave por geração, conferência da Session no fim) indica no máximo 1 Session pagável, mas isso não foi exercitado. | Baixo | `lib/services/billing.ts` (`createCheckoutUrl`, `advanceGeneration`) | Teste de integração que envelhece o lease enquanto a 1ª requisição está parada no `create`. |
| Reserva de orçamento OpenAI não atômica, com estouro sob rajada. | Baixo/Médio | `lib/limits.ts:133-163` | Fazer global, usuário e `ai_reservations` num único CTE, como `reserveFallback` (`:168-186`), e checar `cost + estimativa <= teto`. |
| `messagesThisMonth` soma sem limite superior de data. | Baixo | `lib/limits.ts:85-91` | Adicionar `date < início do mês seguinte`, como `admitMessage` já faz (registrado em `tests/BUGS.md` S5). |

---

## 4. Idempotência

**Webhooks recebidos:**

| Webhook | Assinatura sobre o corpo bruto? | Registro de eventos processados | O que acontece se o mesmo evento chegar 2 vezes |
|---------|-------------------------------|-------------------------------|------------------------------------------------|
| Stripe, `app/api/webhooks/stripe/route.ts` | **Sim.** `constructEvent(await req.text(), …)` vem antes de qualquer outra coisa (`:23`). | **Sim.** `stripe_events.event_id` é PK (`:31-35`), com `processed_at` e `alerted_at`. A task tem idempotencyKey `stripe-${event.id}` (`:52`) e confere `processed_at` de novo (`trigger/stripe-events.ts:33-37`). | Evento já processado: 200 sem efeito. Recebido mas não concluído: é reenfileirado com a mesma chave (o Trigger reaproveita o run). O estado é relido do Stripe, então eventos fora de ordem não aplicam um retrato velho. Coberto por `04` e `14`. |
| Clerk, `app/api/webhooks/clerk/route.ts` | **Sim.** `verifyWebhook` (Svix, valida o corpo bruto). | **Não há tabela.** A deduplicação vem da idempotencyKey do Trigger (`svix-id`, `:24-26`), que tem TTL, mais operações idempotentes (`insert … on conflict`, delete de quem já não existe). | A segunda entrega reusa o mesmo run. Depois do TTL, roda de novo sem efeito colateral, com uma exceção: um `user.created` reentregue **depois** de um `user.deleted` recria a linha do usuário (vazia). |
| Telegram, `app/api/telegram/webhook/route.ts` | Não se aplica. O Telegram não assina o corpo: usa um segredo no header, comparado com `timingSafeEqual` (`:17-24`). | **Sim.** `messages.update_id` é PK, e a task usa idempotencyKey `tg-update-${update_id}`. | Não conta a cota de novo, não grava séries de novo e só reenvia as respostas ainda não entregues (`lib/bot/handle-update.ts:66-77`). |

**Chamadas ao gateway (Stripe):**

| Chamada | Idempotency key? |
|---------|------------------|
| `customers.create` (`billing.ts:269-272`) | Sim: `customer-${user.id}` |
| `checkout.sessions.create` (`billing.ts`, `createSession`) | Sim: `checkout-${user.id}-g${geração}` (a geração só avança quando a Session dela fechou, ou quando um 500 guardado não abriu Session nenhuma) |
| `subscriptions.cancel` / `refunds.create` de assinatura duplicada (`subscription-sync.ts`) | Sim: `duplicate-cancel-…` / `duplicate-refund-…`, montadas com a operação gravada em `duplicate_cleanups` |
| `subscriptions.cancel` após disputa/reembolso (`subscription-sync.ts:243`) | Sim: `risk-cancel-${eventId}-${subId}` |
| `checkout.sessions.expire`, `customers.del`, `billingPortal.sessions.create` | Não. São naturalmente idempotentes (expirar ou apagar de novo falha de forma tratada) ou não criam cobrança. |
| `subscriptions.list/retrieve`, `charges.retrieve`, `checkout.sessions.list/retrieve` | Não se aplica (leitura). |

Do lado do app, `startCheckoutAction` aceita um Idempotency-Key (UUID v4) do cliente e o reivindica no banco antes de rodar (`lib/idempotency.ts`, `app/(app)/actions.ts:250-274`).

| Achado | Risco | Arquivo e linha | Correção sugerida |
|--------|-------|-----------------|-------------------|
| `past_due` libera acesso sem prazo. Isso depende da regra de cobrança do Stripe (quantas tentativas, e se no fim cancela ou deixa como `unpaid`/`past_due`), que **não está no código: não verificado**. | Médio | `lib/services/access.ts:8-19` | Limitar `past_due` a `current_period_end + N dias` (ex.: 7) e conferir no painel do Stripe que o fim das tentativas cancela a assinatura. |
| A idempotência dos webhooks da Clerk depende do TTL da chave do Trigger. Um `user.created` atrasado depois de `user.deleted` ressuscita a linha. | Baixo | `app/api/webhooks/clerk/route.ts:24-26`, `trigger/clerk-users.ts:13-27` | Tabela `clerk_events(svix_id PK)` ou um "tombstone" de `clerk_id` apagado que bloqueie o `user.created`. |
| Exclusão de conta: os dados são apagados e, se a Clerk falhar, o login fica órfão. Num novo login, `ensureUser` recria um usuário vazio. | Baixo | `app/(app)/actions.ts:290-312`, `lib/services/users.ts:7-12` | Apagar primeiro na Clerk (o webhook `user.deleted` já apaga Stripe e banco de forma idempotente), ou registrar a exclusão pendente para reprocessar. |

---

## 5. Separação de responsabilidades

Maiores arquivos (excluindo testes):

| Arquivo | Linhas | Mistura tela + regra + banco/serviço externo? |
|---------|-------:|-----------------------------------------------|
| `app/page.tsx` | 543 | Não. Landing estática (só UI e preços para exibir). |
| `db/schema.ts` | 484 | Não. Só schema. |
| `lib/telegram/render.ts` | 359 | Não. Só templates de texto. |
| `app/(legal)/privacidade/page.tsx`, `termos/page.tsx` | 347 / 341 | Não. Texto. |
| **`app/(app)/actions.ts`** | 312 | **Parcialmente.** Junta autenticação, checagem de assinatura, validação Zod, auditoria no Sentry e **orquestração de negócio entre serviços externos** (exclusão: Stripe → banco → Clerk, `:290-312`; checkout com idempotência, `:250-274`). |
| `components/app/routine-editor.tsx` | 300 | Não. UI. As regras estão em `lib/routine-editor.ts` e `lib/routine-rules.ts`, e o salvamento vai por action. |
| `lib/limits.ts` | 299 | Regra + banco (sem tela), mas **dois domínios** no mesmo arquivo (cota de mensagens e orçamento de IA), com bastante SQL cru. |
| `lib/bot/handle-update.ts` | 257 | Orquestração do bot. Delega para serviços, `render` e `deliver`. Aceitável. |
| `app/(app)/dashboard/page.tsx` | 246 | Não. UI. Os dados vêm de `lib/data`. |

Nenhum componente de tela acessa o banco ou o Stripe direto: tudo passa por Server Actions (`app/(app)/actions.ts`) ou `lib/data`/`lib/services`.

| Achado | Risco | Arquivo e linha | Correção sugerida |
|--------|-------|-----------------|-------------------|
| **Candidato nº 1 para refatorar: `app/(app)/actions.ts`.** A action de exclusão orquestra Stripe, banco e Clerk ali mesmo, e o mesmo fluxo de negócio (cancelar o Stripe antes de apagar o usuário) está **duplicado** em `trigger/clerk-users.ts:226-247`. | Baixo | `app/(app)/actions.ts:290-312`, `trigger/clerk-users.ts:226-247` | Criar `lib/services/account.ts` com `deleteAccount(user)`, usado pela action e pela task. Mover o par `runOnce` + `usableCheckoutUrl` para `lib/services/billing.ts` (`startCheckout(user, plan, key)`). As actions ficam como controllers finos: auth → Zod → serviço → log. |
| `lib/limits.ts` junta cota de mensagens e orçamento de IA. | Baixo | `lib/limits.ts` | Separar em `lib/limits/messages.ts` e `lib/limits/ai-budget.ts`. |

---

## Prompts de correção

1. **Checkout: cobrir a tomada do lease:** "Em `tests/integration/14-idempotencia-pagamentos.test.ts`, adicione um teste em que a 1ª requisição de checkout fica parada no `checkout.sessions.create` até o lease de `checkout_slots` passar de 30 s, uma 2ª (outro plano) assume, e no fim existe no máximo 1 Checkout Session aberta. Rode a suíte de integração no Node 22 para validar os testes novos de checkout e de assinatura duplicada."
2. **RLS de verdade:** "Troque a conexão do app para a role `app_runtime`, definindo `set_config('app.user_id', …, true)` em cada transação, e mantenha uma conexão de serviço para as tabelas server-only. Ou, se não for agora, corrija o comentário de `ci.yml:84`."
3. **Testes unitários locais:** "Descubra por que `npm test` falha em todos os arquivos com `reading 'config'` no Node 24/Windows, corrija e fixe a versão do Node em `engines`/`.nvmrc`."
4. **Prazo para `past_due`:** "Em `lib/services/access.ts`, limite o acesso em `past_due` a `current_period_end + 7 dias` e cubra com teste em `02-acesso`."
5. **Orçamento atômico + serviço de conta:** "Reescreva `reserveAiBudget` como um único CTE com `cost + estimativa <= teto`, e extraia `deleteAccount` para `lib/services/account.ts`, usado pela action e pela task da Clerk."

**Rode primeiro o prompt 3.** Sem os testes rodando localmente, nenhuma correção (inclusive as de pagamento) pode ser validada fora do CI. O checkout duplicado (1) já tem guarda no banco, limpeza automática e alerta; falta só um teste de borda. Os outros são defesa em profundidade (2) ou dependem de configuração externa (4).
