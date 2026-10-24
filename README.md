# Iron AI

Assistente de treino no Telegram + site Next.js (painel, rotina, histórico). Stack: Next.js 16, Clerk, Drizzle + Neon, Trigger.dev.

## Rodando o projeto localmente

Abra **3 terminais** na raiz do projeto, um para cada processo:

```bash
# Terminal 1 — site Next.js (http://localhost:3000)
npm run dev

# Terminal 2 — worker do Trigger.dev (executa as tasks em ./trigger)
npx trigger.dev@4.8.1 dev

## Ou 
ngrok http --url=embassy-ambition-wager.ngrok-free.dev 3000

# Terminal 3 — túnel público para os webhooks do Clerk
ngrok http 3000
```

A versão do CLI (`trigger.dev@4.8.1`) deve ser a mesma de `@trigger.dev/sdk` no `package.json`.

Se a URL do ngrok mudou (plano gratuito sem domínio fixo), atualize o endpoint no Clerk Dashboard → Webhooks para:

```
https://<url-do-ngrok>/api/webhooks/clerk
```

Eventos assinados: `user.created`, `user.updated`, `user.deleted`.

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
```

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

## Como os webhooks funcionam

Clerk → `POST /api/webhooks/clerk` ([app/api/webhooks/clerk/route.ts](app/api/webhooks/clerk/route.ts)) valida a assinatura e dispara uma task do Trigger.dev ([trigger/clerk-users.ts](trigger/clerk-users.ts)), que cria, atualiza ou apaga o usuário no Neon. Os runs aparecem em [cloud.trigger.dev](https://cloud.trigger.dev/projects/v3/proj_plpwgmrshwngodbkqrdd/runs?envSlug=dev).
