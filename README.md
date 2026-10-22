# Iron

## Rodar o projeto

Abra 3 terminais na raiz do repositório e rode um comando em cada.

**1. Backend (FastAPI, porta 8000)**

```powershell
cd backend
uv run uvicorn backend.main:app --reload --port 8000
```

**2. Túnel do ngrok (expõe o backend para o webhook do Clerk)**

```powershell
ngrok http --url=embassy-ambition-wager.ngrok-free.dev 8000
```

**3. Frontend (Vite, porta 5173)**

```powershell
cd frontend
npm run dev
```

O webhook do Clerk aponta para `https://embassy-ambition-wager.ngrok-free.dev/webhook/clerk`. O domínio é fixo, então não precisa reconfigurar o Clerk. Para ver as requisições chegando, abra `http://localhost:4040`.

## Primeira vez (ou depois de clonar)

```powershell
cd backend
uv sync                          # instala as dependências
uv run alembic upgrade head      # cria as tabelas no Neon

cd ../frontend
npm install
```

## Variáveis de ambiente

`backend/.env` (modelo em `backend/.env.example`):

```
DATABASE_URL=postgresql+psycopg://USER:PASS@HOST.neon.tech/neondb?sslmode=require
CLERK_WEBHOOK_SECRET=whsec_...
```

`frontend/.env`:

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

## Migrações

Depois de mudar `backend/src/backend/models/db.py`:

```powershell
cd backend
uv run alembic revision --autogenerate -m "descrição"
uv run alembic upgrade head
```

## Problemas comuns

- **Usuário criado no Clerk mas não no Neon:** veja Clerk → Webhooks → Endpoints → Logs. Use **Replay** para reenviar a mensagem. Confira também se o ngrok e o backend estão rodando.
- **400 `invalid signature`:** o `CLERK_WEBHOOK_SECRET` do `backend/.env` não é o do endpoint em uso.
