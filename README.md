# Iron AI

Assistente de treino no Telegram + site Next.js (painel, rotina, histórico). Stack: Next.js 16, Clerk, Drizzle + Neon, Trigger.dev.

## Rodando o projeto localmente

Abra **4 terminais** na raiz do projeto, um para cada processo:

```bash
# Terminal 1 — site Next.js (http://localhost:3000)
npm run dev

# Terminal 2 — worker do Trigger.dev (executa as tasks em ./trigger)
npx trigger.dev@4.8.1 dev

# Terminal 3 — túnel público para os webhooks do Clerk e do Telegram
ngrok http 3000

## Ou 
ngrok http --url=embassy-ambition-wager.ngrok-free.dev 3000

# Terminal 4 — encaminha os webhooks do Stripe para o site local
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

O `stripe listen` imprime um segredo `whsec_...`: ele vai em `STRIPE_WEBHOOK_SECRET` no `.env.local` (reinicie o `npm run dev` ao trocar). Requer o [Stripe CLI](https://docs.stripe.com/stripe-cli) e `stripe login` (a sessão expira; se der 401 "Expired API Key", faça login de novo).

A versão do CLI (`trigger.dev@4.8.1`) deve ser a mesma de `@trigger.dev/sdk` no `package.json`.

Se a URL do ngrok mudou (plano gratuito sem domínio fixo), atualize o endpoint no Clerk Dashboard → Webhooks para:

```
https://<url-do-ngrok>/api/webhooks/clerk
```

Eventos assinados: `user.created`, `user.updated`, `user.deleted`.

Com o túnel no ar, aponte o bot de **dev** para ele (repita sempre que a URL mudar):

```bash
npm run telegram:webhook -- https://<url-do-ngrok>
```

## Primeira vez em uma máquina nova

```bash
npm install
npx trigger.dev@4.8.1 login   # abre o navegador para autorizar o CLI
```

Crie o `.env` na raiz com:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=   # Clerk Dashboard → API Keys
CLERK_SECRET_KEY=                    # Clerk Dashboard → API Keys
CLERK_WEBHOOK_SIGNING_SECRET=        # Clerk Dashboard → Webhooks → endpoint → Signing Secret
DATABASE_URL=                        # Neon → Connection string
TRIGGER_SECRET_KEY=                  # Trigger.dev → API Keys → Development (tr_dev_...)

NEXT_PUBLIC_SITE_URL=http://localhost:3000   # links enviados pelo bot
TELEGRAM_BOT_TOKEN=                  # @BotFather → /newbot (use um bot para dev e outro para prod)
TELEGRAM_BOT_USERNAME=               # nome do bot sem @, para o link t.me/<bot>?start=<token>
TELEGRAM_WEBHOOK_SECRET=             # 16–256 chars [A-Za-z0-9_-]; ex.: openssl rand -hex 32
OPENAI_API_KEY=                      # platform.openai.com → API keys

STRIPE_SECRET_KEY=                   # Stripe → Developers → API keys (sk_test_... em dev; prefira uma chave restrita rk_...)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=  # Stripe → Developers → API keys (pk_test_...)
STRIPE_WEBHOOK_SECRET=               # whsec_... do `stripe listen` (dev) ou do endpoint de webhook (prod)
STRIPE_PRICE_MONTHLY=                # price_... do plano mensal (R$ 19,90)
STRIPE_PRICE_ANNUAL=                 # price_... do plano anual (R$ 199,00)

# Opcionais
OPENAI_PARSER_MODEL=gpt-5.4-mini     # modelo do parser (precisa de Structured Outputs)
OPENAI_FALLBACK_MODEL=gpt-5.5        # usado se o principal estiver fora do ar
OPENAI_DAILY_BUDGET_USD=5            # teto global de gasto/dia; acima disso o bot pausa a leitura. Suba junto com a base: ~US$ 0,02 por usuário ativo/dia
OPENAI_USER_DAILY_BUDGET_USD=0.25    # teto de gasto/dia por usuário (60 mensagens custam ~US$ 0,12)
OPENAI_FALLBACK_DAILY_BUDGET_USD=1   # quanto do teto global o modelo de fallback (~7x mais caro) pode gastar/dia
DAILY_MESSAGE_LIMIT=60               # mensagens de texto por usuário/dia
MONTHLY_MESSAGE_LIMIT=1000           # mensagens de texto por usuário/mês
FAST_PATH=shadow                     # atalho sem LLM para "supino 3x10 20kg" e "terminei": off | shadow (compara com o modelo) | on
# Preços dos modelos padrão estão em lib/ai/pricing.ts; para outro modelo, estas variáveis servem de estimativa:
OPENAI_PRICE_INPUT_USD_PER_MTOK=1
OPENAI_PRICE_CACHED_INPUT_USD_PER_MTOK=0.1
OPENAI_PRICE_OUTPUT_USD_PER_MTOK=6
NEXT_PUBLIC_SENTRY_DSN=              # Sentry (sem PII); vazio = desligado. Sentry → Project Settings → Client Keys (DSN)
NEXT_PUBLIC_SENTRY_ENVIRONMENT=      # ex.: production / preview; padrão = NODE_ENV
SENTRY_AUTH_TOKEN=                   # só no build (Vercel/CI) para enviar source maps; Sentry → Settings → Auth Tokens
```

No Trigger.dev Cloud (ambiente **prod**), cadastre as mesmas variáveis usadas pelas tasks: `DATABASE_URL`, `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `NEXT_PUBLIC_SITE_URL`, as opcionais da OpenAI e `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` (erros e logs das tasks vão para o mesmo projeto do Sentry, via `trigger/init.ts`). Em dev, o `trigger.dev dev` lê o `.env` local.

Os planos e o portal de cobrança do Stripe precisam existir na conta (produto com dois preços recorrentes e o Customer Portal configurado); os ids dos preços vão nas variáveis `STRIPE_PRICE_*`.

Se o banco estiver vazio, aplique as migrações e o catálogo de exercícios:

```bash
npm run db:setup
```

## Banco de dados (Drizzle)

```bash
npm run db:generate   # gera migração a partir de db/schema.ts
npm run db:migrate    # aplica migrações pendentes
npm run db:seed       # (re)popula o catálogo de exercícios
npm run db:studio     # abre o Drizzle Studio
```

## Testes e checagens

```bash
npm run lint
npm run typecheck
npm test          # vitest: motor de progressão, sessão, recordes, relatórios, lembretes
```

O CI (`.github/workflows/ci.yml`) roda os três em cada push/PR.

## Assinatura (Stripe)

Todo acesso exige assinatura: 14 dias grátis (cartão no Checkout), depois R$ 19,90/mês ou R$ 199,00/ano.

```
Login/cadastro → /assinar (escolhe Mensal ou Anual) → Stripe Checkout → /assinar/sucesso → painel
Configurações → "Gerenciar assinatura" → Customer Portal (cancelar, trocar plano, cartão, faturas)
```

- O Stripe é a fonte da verdade: `POST /api/webhooks/stripe` ([app/api/webhooks/stripe/route.ts](app/api/webhooks/stripe/route.ts)) valida a assinatura e todo evento vira `syncSubscription`, que relê a assinatura no Stripe e grava em `subscriptions`. Eventos repetidos ou fora de ordem são seguros.
- Têm acesso os status `trialing`, `active` e `past_due`. Sem acesso: o painel redireciona para `/assinar`, o bot responde pedindo a assinatura e os lembretes (`tick`) não são enviados.
- Eventos assinados no endpoint: `customer.subscription.created|updated|deleted`, `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`.
- Excluir a conta apaga também o customer no Stripe (cancela a cobrança).
- Teste em dev com o cartão `4242 4242 4242 4242`. Com o `stripe listen` no ar, `stripe trigger customer.subscription.updated` também funciona.
- Produção: crie o endpoint `https://<dominio>/api/webhooks/stripe` com os eventos acima, use as chaves `live`, ajuste o `default_return_url` do portal e cadastre as variáveis `STRIPE_*` no host do site (as tasks do Trigger.dev só leem o banco, não precisam delas).
- Se as migrações novas não foram aplicadas (`subscriptions`, `users.stripe_customer_id`), o login quebra com erro de coluna inexistente: rode `npm run db:migrate`.

## Como o bot funciona

```
Telegram → POST /api/telegram/webhook   valida o secret, aplica os limites (60 msgs/dia, 1.000/mês), enfileira
        → task telegram-handle-update    1 run por update_id (idempotencyKey), 1 por usuário por vez (concurrencyKey)
            → lib/ai/fast-parse.ts        atalho sem LLM para mensagens simples (FAST_PATH)
            → OpenAI responses.parse      Structured Outputs (Zod estrito, lib/ai/schemas.ts): só interpreta; reasoning desligado
            → lib/engine                  progressão 8→12, recordes, sessão, rodízio — código determinístico
            → lib/telegram/render.ts      toda resposta é template pt-BR
```

- Baixa confiança (< 0,7) ou exercício ambíguo ⇒ botões de confirmação/escolha; nada é gravado antes.
- Correções anulam a série antiga e gravam uma nova (log imutável); as metas são recalculadas do histórico inteiro.
- `tick` (a cada 15 min): fecha sessões paradas há 90 min e manda lembretes nos dias/horário de cada usuário com assinatura ativa.
- `purge` (diário): apaga texto bruto das mensagens após 30 dias, tokens usados/expirados e contadores antigos.

## Custos de IA

- Cada chamada é registrada em `ai_usage` (global, com tokens em cache e gasto do fallback) e `ai_usage_user` (por usuário), com o preço do modelo que respondeu.
- `FAST_PATH=shadow` (padrão): o atalho roda ao lado do modelo e o log `Telegram update handled` traz `fast_path=agree|disagree`. Com `disagree` ≈ 0 em dados reais, mude para `on`.
- Para avaliar outro modelo (ex.: nano) com mensagens reais: `npm run ai:export-golden`, revise `scripts/golden/golden.json` à mão e rode `npm run ai:eval -- <modelo> --fast`. A pasta é ignorada pelo git (contém texto de usuários).

## Como os webhooks do Clerk funcionam

Clerk → `POST /api/webhooks/clerk` ([app/api/webhooks/clerk/route.ts](app/api/webhooks/clerk/route.ts)) valida a assinatura e dispara uma task do Trigger.dev ([trigger/clerk-users.ts](trigger/clerk-users.ts)), que cria, atualiza ou apaga o usuário no Neon. Os runs aparecem em [cloud.trigger.dev](https://cloud.trigger.dev/projects/v3/proj_plpwgmrshwngodbkqrdd/runs?envSlug=dev).
