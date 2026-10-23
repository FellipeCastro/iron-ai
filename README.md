# Iron

Agente de IA no Telegram que registra séries de academia e conduz a progressão de carga. O site serve para cadastro (Clerk), vínculo da conta do Telegram e acompanhamento dos dados. O plano completo está em [PLAN.md](PLAN.md).

- **Backend:** FastAPI, LangGraph, Postgres (Neon em produção), SQLAlchemy e Alembic. Gerenciado com uv.
- **Frontend:** Vite, React 19, Tailwind 4, Clerk e Recharts.

## Pré-requisitos

- Python 3.14 e [uv](https://docs.astral.sh/uv/)
- Node 22+
- Docker (Postgres local e testes)
- ngrok (só para o modo webhook em desenvolvimento)
- Contas: Clerk, Neon, OpenAI e um bot do Telegram (veja abaixo)

## Primeira vez (ou depois de clonar)

```powershell
cd backend
uv sync                          # instala as dependências
cp .env.example .env             # depois preencha (veja "Variáveis de ambiente")
uv run alembic upgrade head      # cria as tabelas no banco do DATABASE_URL

cd ../frontend
npm install
cp .env.example .env
```

## Criar o bot do Telegram

1. No Telegram, abra o **@BotFather** e envie `/newbot`.
2. Informe o nome de exibição (ex.: `Iron AI`) e o username, que precisa terminar em `bot` (ex.: `iron_ai_bot`).
3. Copie o token que ele devolve (`123456789:AAH-...`) para `TELEGRAM_BOT_TOKEN`. O username, sem o `@`, vai em `TELEGRAM_BOT_USERNAME`.
4. Gere o secret do webhook, que é um valor inventado por você:
   ```powershell
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```
   Cole em `TELEGRAM_WEBHOOK_SECRET`.

O token funciona como uma senha. Se vazar, envie `/revoke` ao BotFather para gerar outro.

## Variáveis de ambiente

`backend/.env` (modelo completo em `backend/.env.example`):

```
DATABASE_URL=postgresql://USER:PASS@HOST.neon.tech/neondb?sslmode=require
CLERK_WEBHOOK_SECRET=whsec_...
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...        # opcional: permite excluir a conta no Clerk ao apagar a conta no Iron

TELEGRAM_BOT_TOKEN=123456789:AAH-...
TELEGRAM_BOT_USERNAME=iron_ai_bot
TELEGRAM_WEBHOOK_SECRET=...
TELEGRAM_MODE=webhook               # webhook (com ngrok) ou polling (sem URL pública)
PUBLIC_BASE_URL=https://embassy-ambition-wager.ngrok-free.dev
SITE_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173

OPENAI_API_KEY=sk-...
```

`frontend/.env`:

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL=http://localhost:8000
```

## Rodar o projeto

### Opção A: webhook (com ngrok)

Abra 3 terminais na raiz do repositório e rode um comando em cada.

**1. Backend (FastAPI, porta 8000)**

```powershell
cd backend
uv run uvicorn backend.main:app --reload --port 8000
```

Com `TELEGRAM_MODE=webhook`, o backend registra o webhook do Telegram sozinho ao subir. Ele também inicia o worker do inbox e o agendador de lembretes.

**2. Túnel do ngrok (expõe o backend para os webhooks do Clerk e do Telegram)**

```powershell
ngrok http --url=embassy-ambition-wager.ngrok-free.dev 8000
```

**3. Frontend (Vite, porta 5173)**

```powershell
cd frontend
npm run dev
```

O webhook do Clerk aponta para `https://embassy-ambition-wager.ngrok-free.dev/webhook/clerk` e o do Telegram para `.../webhook/telegram`. O domínio é fixo, então não precisa reconfigurar o Clerk. Para ver as requisições chegando, abra `http://localhost:4040`.

### Opção B: long polling (sem ngrok)

Use `TELEGRAM_MODE=polling` no `backend/.env`. O backend busca as mensagens no Telegram e grava no mesmo inbox do webhook, então só precisa de 2 terminais (backend e frontend). Sem o ngrok, o webhook do Clerk não chega: o usuário é criado na primeira chamada autenticada à API.

**Usuário de teste com dados prontos.** Para já ter rotina (Peito/Costas/Pernas), 4 semanas de histórico e metas, rode o seed com o `clerk_id` da conta com que você faz login (Clerk Dashboard > Users, formato `user_...`):

```powershell
cd backend
uv run python scripts/seed_test_user.py --clerk-id user_xxx                          # cria
uv run python scripts/seed_test_user.py --clerk-id user_xxx --telegram-id 123456789  # já vinculado ao Telegram
uv run python scripts/seed_test_user.py --clerk-id user_xxx --reset                  # apaga e recria
```

Sem `--clerk-id`, cria o usuário fictício `user_teste_local` (útil só para inspecionar o banco, já que não dá para logar nele).

### Banco local (opcional)

Para desenvolver sem tocar no Neon, suba o Postgres do compose e aponte o `DATABASE_URL` para ele:

```powershell
cd backend
docker compose up -d db          # Postgres em localhost:5433
$env:DATABASE_URL = "postgresql://iron:iron@localhost:5433/iron"
uv run alembic upgrade head
uv run uvicorn backend.main:app --reload
```

`docker compose up` (sem `-d db`) também sobe o backend em container, aplicando as migrações antes.

## Testar o fluxo ponta a ponta

1. Abra `http://localhost:5173`, crie a conta e vá para `/vincular`.
2. Clique em **Abrir Telegram** e toque em **Iniciar**. A tela atualiza sozinha quando a conta é vinculada.
3. No Telegram, peça para montar a rotina ou mande uma série, por exemplo: `supino reto 10 reps 20kg`.
4. Veja o histórico, a rotina e os gráficos no site.

## Migrações

Depois de mudar `backend/src/backend/models/db.py`:

```powershell
cd backend
uv run alembic revision --autogenerate -m "descrição"
uv run alembic upgrade head
```

## Testes e qualidade

```powershell
cd backend
docker compose up -d db          # os testes usam o Postgres local (banco iron_test)
uv run pytest
uv run ruff check src

cd ../frontend
npm run lint
npm run build
```

## Agente em modo REPL

Para conversar com o agente pelo terminal, sem o Telegram (precisa de um usuário existente):

```powershell
cd backend
uv run python -m backend.agents.iron_agent <user_id>
```

Ele também grava o diagrama do grafo em `iron_graph.md`.

## Problemas comuns

- **Bot não responde:** abra `https://api.telegram.org/bot<SEU_TOKEN>/getWebhookInfo`. O campo `url` deve ser o do ngrok e `last_error_message` deve estar vazio. Confira também se o ngrok e o backend estão rodando.
- **401 em `/webhook/telegram`:** o `TELEGRAM_WEBHOOK_SECRET` mudou depois do registro do webhook. Reinicie o backend para registrar de novo.
- **Código de vínculo "inválido":** ele expira em 15 minutos e vale uma vez. Gere um novo em `/vincular`. Depois de 5 tentativas erradas, o chat fica bloqueado por 15 minutos.
- **Trocou entre webhook e polling:** só um dos dois funciona por vez. O backend ajusta isso ao subir.
- **Usuário criado no Clerk mas não no Neon:** veja Clerk → Webhooks → Endpoints → Logs e use **Replay** para reenviar. Confira também se o ngrok e o backend estão rodando.
- **400 `invalid signature` no webhook do Clerk:** o `CLERK_WEBHOOK_SECRET` do `backend/.env` não é o do endpoint em uso.
- **401 em todas as rotas da API:** confira se `CLERK_PUBLISHABLE_KEY` do backend é da mesma instância do Clerk usada no frontend.
- **Erro de CORS no navegador:** inclua a origem do frontend em `CORS_ORIGINS`.
