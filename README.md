# 🏋️‍♂️ Iron AI

> O contato inteligente que organiza os seus treinos. Você conta o treino em texto livre, o código cuida da progressão.

## Sobre o Projeto

Um contato na sua lista de conversas que organiza os seus treinos. Para quem treina musculação e quer parar de anotar série em planilha, é só mandar mensagem em linguagem natural ("supino 3x10 20kg", "terminei") e o contato registra, calcula a próxima meta, lembra do treino e mostra a evolução. O canal da conversa é o Telegram, e o site Next.js entrega painel, treinos, histórico e gráficos de evolução.

Não é um chatbot que "opina" sobre treino: o Iron organiza, não aconselha. A IA tem uma única função: **interpretar** o que o usuário escreveu. Progressão de carga, recordes, rodízio de treinos e respostas são código determinístico e templates em pt-BR, o que torna o resultado previsível e barato. A saída do modelo passa por Structured Outputs (via schemas Zod) antes de tocar no banco.

## 🛠️ Stack Tecnológica

### Core & Frontend
- **Framework:** Next.js 16 (App Router + Turbopack) com React 19
- **Estilização:** Tailwind CSS 4
- **Gráficos:** componentes próprios em SVG (linha, barra, sparkline)
- **Drag and drop:** dnd-kit (edição da rotina)

### IA & Backend
- **LLM:** OpenAI (`gpt-5.4-mini` por padrão, com fallback para `gpt-5.5`) via SDK `openai`
- **Validação:** Zod 4 (Structured Outputs com `responses.parse`)
- **Jobs em background:** Trigger.dev 4 (processamento do bot, lembretes e limpeza agendada)
- **Banco de dados:** Neon (Postgres serverless) com Drizzle ORM
- **Autenticação:** Clerk
- **Pagamentos:** Stripe (Checkout, Customer Portal e webhooks)
- **Observabilidade:** Sentry, sem PII
- **Testes:** Vitest

## ⚡ Módulos do Produto

A plataforma é dividida em módulos, cada um com responsabilidade única:

### 1. Contato de Treino (Telegram)
O registro do treino acontece na conversa.

- **Texto livre:** entende "supino 3x10 20kg", correções e remoção de séries.
- **Confirmação inteligente:** com baixa confiança (< 0,7) ou exercício ambíguo, o contato pergunta com botões e não grava nada antes.
- **Atalho sem LLM:** mensagens simples são resolvidas por regra, sem custo de modelo (`FAST_PATH`).
- **Comandos:** `/treino`, `/terminei`, `/semana` e `/ajuda`.

### 2. Motor de Progressão
Código puro, sem I/O, coberto por testes.

- **Progressão 6→12:** +1 rep a cada treino; ao chegar em 12, sobe a carga e volta para 6.
- **Recordes:** maior carga e melhor série em cada carga.
- **Estagnação:** detecta 3 sessões sem progresso.
- **Rodízio:** define o próximo treino (A→B→C) e fecha sessões paradas há 90 minutos.
- **Log imutável:** correções anulam a série antiga e gravam uma nova; as metas são recalculadas do histórico inteiro.

### 3. Painel Web
- **Dashboard:** próximo treino, metas, recordes e métricas.
- **Rotina:** edição dos dias e exercícios, com catálogo pt-BR de 94 exercícios e aliases.
- **Histórico e gráficos:** evolução por exercício e por grupo muscular.
- **Configurações:** horário do lembrete, dias de treino, incremento de carga e fuso horário.

### 4. Lembretes e Relatórios
- **Lembretes:** enviados no dia e horário de cada usuário, só para quem tem assinatura ativa e nenhuma sessão aberta.
- **Resumos:** gerados ao fechar a sessão.
- **Relatórios:** por exercício e por grupo, em texto no Telegram com link para o site.

### 5. Assinatura
- **Sem teste grátis:** a primeira cobrança é feita no Checkout. R$ 14,90/mês ou R$ 139,90/ano (à vista, sem parcelamento e sem fidelidade).
- **Customer Portal:** cancelamento, troca de plano, cartão e faturas.
- **Controle de risco:** disputa aberta ou reembolso total cancelam a assinatura na hora.

## 🏗️ Arquitetura de IA

Para evitar alucinações e dados corrompidos, o modelo nunca escreve a resposta final nem decide a carga do próximo treino. O fluxo é:

1. **Schema Definition:** as intenções possíveis (registrar série, corrigir, apagar, finalizar) são definidas com Zod, como uma união discriminada.
2. **Generation:** o modelo é forçado a responder no schema via Structured Outputs, com reasoning desligado.
3. **Validation:** a saída é validada com Zod e cruzada com o catálogo de exercícios por nome e alias.
4. **Execution:** o motor determinístico grava a série, recalcula metas e recordes, e a resposta sai de um template pt-BR.

```
Telegram → POST /api/telegram/webhook   valida o secret, aplica os limites (60 msgs/dia, 1.000/mês), enfileira
        → task telegram-handle-update    1 run por update_id (idempotencyKey), 1 por usuário por vez (concurrencyKey)
            → lib/ai/fast-parse.ts        atalho sem LLM para mensagens simples (FAST_PATH)
            → OpenAI responses.parse      Structured Outputs (Zod estrito, lib/ai/schemas.ts): só interpreta
            → lib/engine                  progressão 6→12, recordes, sessão, rodízio
            → lib/telegram/render.ts      toda resposta é template pt-BR
```

### Tarefas agendadas
- **`tick`** (a cada 15 min): fecha sessões paradas há 90 min e envia os lembretes.
- **`purge`** (diário): apaga o texto bruto das mensagens após 30 dias, tokens usados ou expirados e contadores antigos.

### Controle de custos
- Cada chamada é registrada em `ai_usage` (global) e `ai_usage_user` (por usuário), com o preço do modelo que respondeu.
- Tetos diários global, por usuário e para o modelo de fallback, mais limites de mensagens por dia e por mês.
- Para avaliar outro modelo com mensagens reais: `npm run ai:export-golden`, revise `scripts/golden/golden.json` à mão e rode `npm run ai:eval -- <modelo> --fast`.

## 🚀 Como Rodar Localmente

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/FellipeCastro/iron-ai.git
   cd iron-ai
   ```

2. **Instale as dependências e autorize o CLI do Trigger.dev:**
   ```bash
   npm install
   npx trigger.dev@4.8.1 login   # abre o navegador para autorizar o CLI
   ```

3. **Configure as variáveis de ambiente.** Crie um arquivo `.env` na raiz:
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
   STRIPE_PRICE_MONTHLY=                # price_... do plano mensal (R$ 14,90/mês)
   STRIPE_PRICE_ANNUAL=                 # price_... do plano anual (R$ 139,90/ano, à vista)
   ```

   <details>
   <summary>Variáveis opcionais</summary>

   ```bash
   OPENAI_PARSER_MODEL=gpt-5.4-mini     # modelo do parser (precisa de Structured Outputs)
   OPENAI_FALLBACK_MODEL=gpt-5.5        # usado se o principal estiver fora do ar
   OPENAI_DAILY_BUDGET_USD=5            # teto global de gasto/dia; acima disso o bot pausa a leitura
   OPENAI_USER_DAILY_BUDGET_USD=0.25    # teto de gasto/dia por usuário
   OPENAI_FALLBACK_DAILY_BUDGET_USD=1   # quanto do teto global o fallback (~7x mais caro) pode gastar/dia
   DAILY_MESSAGE_LIMIT=60               # mensagens de texto por usuário/dia
   MONTHLY_MESSAGE_LIMIT=1000           # mensagens de texto por usuário/mês
   FAST_PATH=shadow                     # atalho sem LLM: off | shadow (compara com o modelo) | on
   OPENAI_PRICE_INPUT_USD_PER_MTOK=1    # estimativa para modelos fora de lib/ai/pricing.ts
   OPENAI_PRICE_CACHED_INPUT_USD_PER_MTOK=0.1
   OPENAI_PRICE_OUTPUT_USD_PER_MTOK=6
   NEXT_PUBLIC_SENTRY_DSN=              # Sentry (sem PII); vazio = desligado
   NEXT_PUBLIC_SENTRY_ENVIRONMENT=      # ex.: production / preview; padrão = NODE_ENV
   SENTRY_AUTH_TOKEN=                   # só no build (Vercel/CI) para enviar source maps
   ```
   </details>

4. **Prepare o banco** (migrações + catálogo de exercícios):
   ```bash
   npm run db:setup
   ```

5. **Execute o projeto.** Abra **4 terminais** na raiz, um para cada processo:
   ```bash
      # Terminal 1 — site Next.js (http://localhost:3000)
      npm run dev

      # Terminal 2 — worker do Trigger.dev (executa as tasks em ./trigger)
      npx trigger.dev@4.8.1 dev
      npm run trigger:dev

      # Terminal 3 — túnel público para os webhooks do Clerk e do Telegram
      ngrok http 3000

      # Terminal 4 — encaminha os webhooks do Stripe para o site local
      stripe listen --forward-to localhost:3000/api/webhooks/stripe
      stripe listen --all-snapshot --forward-to localhost:3000/api/webhooks/stripe
   ```

   A versão do CLI (`trigger.dev@4.8.1`) deve ser a mesma de `@trigger.dev/sdk` no `package.json`.

6. **Aponte os webhooks para o ambiente local:**
   - **Stripe:** o `stripe listen` imprime um segredo `whsec_...`. Coloque em `STRIPE_WEBHOOK_SECRET` e reinicie o `npm run dev`. Requer o [Stripe CLI](https://docs.stripe.com/stripe-cli) e `stripe login` (se der 401 "Expired API Key", faça login de novo).
   - **Clerk:** no Clerk Dashboard → Webhooks, use `https://<url-do-ngrok>/api/webhooks/clerk` com os eventos `user.created`, `user.updated` e `user.deleted`.
   - **Telegram:** aponte o bot de **dev** para o túnel (repita sempre que a URL do ngrok mudar):
     ```bash
     npm run telegram:webhook -- https://<url-do-ngrok>
     ```

### Trigger.dev em produção
No Trigger.dev Cloud (ambiente **prod**), cadastre as variáveis usadas pelas tasks: `DATABASE_URL`, `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `NEXT_PUBLIC_SITE_URL`, as opcionais da OpenAI e `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT`. Em dev, o `trigger.dev dev` lê o `.env` local.

### Stripe
Crie no produto do Iron AI um preço recorrente mensal de R$ 14,90 e um anual de R$ 139,90 (em teste e em `live`) e copie os IDs `price_...` para `STRIPE_PRICE_MONTHLY` e `STRIPE_PRICE_ANNUAL`. Os valores em `components/landing/pricing.tsx` precisam bater com os do Stripe. Ative o Customer Portal no Dashboard. Em dev, teste com o cartão `4242 4242 4242 4242`.

Em produção, crie o endpoint `https://<dominio>/api/webhooks/stripe` com os eventos `customer.subscription.created|updated|deleted`, `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `charge.dispute.created`, `charge.refunded` e `radar.early_fraud_warning.created`. Use as chaves `live` e cadastre as variáveis `STRIPE_*` no host do site.

## 🗄️ Banco de Dados (Drizzle)

```bash
npm run db:generate   # gera migração a partir de db/schema.ts
npm run db:migrate    # aplica migrações pendentes
npm run db:seed       # (re)popula o catálogo de exercícios
npm run db:studio     # abre o Drizzle Studio
```

Se o login quebrar com erro de coluna inexistente, as migrações novas não foram aplicadas: rode `npm run db:migrate`.

## ✅ Testes e Checagens

```bash
npm run lint
npm run typecheck
npm test          # vitest: motor de progressão, sessão, recordes, lembretes
```

O CI (`.github/workflows/ci.yml`) roda os três em cada push e PR.

## 🤝 Contribuição

Pull requests são bem-vindos. Para mudanças maiores, por favor abra uma issue primeiro para discutir o que você gostaria de mudar.
