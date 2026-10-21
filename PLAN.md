# Iron AI — Plano de Implementação (v1)

Agente de IA no WhatsApp que registra séries de academia e conduz a progressão de carga. O site serve para cadastro (Clerk), vínculo do número e acompanhamento dos dados.

## 1. Decisões fechadas

| Tema | Decisão |
|---|---|
| WhatsApp | Evolution API com Baileys (QR code), um número dedicado do Iron, atrás de uma interface `WhatsAppGateway` |
| Progressão | Por série. Bateu a meta → meta+1 rep até 12. Com 12 reps → 8 reps e +5kg (incremento configurável). Não bateu → mantém a meta |
| Rotina | Sequência rotativa A→B→C. O próximo treino é o seguinte ao último concluído |
| Exercício novo | Sem meta inicial. A meta nasce da primeira série registrada |
| Fuso e sessão | Fuso do usuário (padrão America/Sao_Paulo). Sessão = dia local, com virada às 04:00 |
| Mensagens | Webhook grava em `inbox` (chave única pelo message id) e responde 200. Um worker processa em ordem, um usuário por vez |
| Lembrete | Horário fixo nos dias de treino. Pula se já houve série no dia. Dedup por (usuário, dia) |
| Vínculo | Código IRON-XXXX de uso único, expira em 15 min, 1 número por conta, tentativas limitadas por número |
| Escala | Piloto de ~50 usuários, limite de ~100 msgs/dia por usuário |
| LLM | OpenAI, modelo mini. Só interpreta e redige. Usa apenas tools tipadas |
| Hosting | Docker com 1 réplica (Render, Railway ou Fly). A Evolution API roda em host persistente |

### Assumptions
- 1RM pela fórmula de Epley: `kg × (1 + reps/30)`.
- A correção ("errei, foi 25kg") altera a última série registrada. Se ficar ambíguo, o Iron confirma.
- Exercício fora da rotina é registrado como avulso, sem meta.
- Confirmações pendentes (resumo da rotina) ficam no Postgres.
- Ambientes: local (docker-compose) e produção. Sem staging.
- Idioma: pt-BR.

## 2. Estrutura do repositório

O backend segue o layout (`agents/`, `models/`, `utils/`, `main.py`, `pyproject.toml` com uv), com FastAPI e camadas de confiabilidade adicionadas.

```
iron-ai/
├─ backend/
│  ├─ main.py                  # FastAPI (uvicorn main:app); lifespan sobe worker do inbox e scheduler
│  ├─ pyproject.toml           # uv, Python >=3.12, langchain, langgraph, langchain-openai, pydantic + fastapi, sqlalchemy, alembic, apscheduler, sentry-sdk
│  ├─ docker-compose.yml       # postgres local, evolution-api, backend
│  ├─ alembic/ + alembic.ini
│  ├─ agents/
│  │  ├─ iron_agent.py         # grafo principal: router_node + conditional edges (espelha data_agent.py)
│  │  ├─ workout_logger.py     # subagente: registrar e corrigir séries (tool-calling)
│  │  ├─ routine_builder.py    # subagente: importar/gerar rotina e pedir confirmação
│  │  └─ progress_analyst.py   # subagente: consulta de evolução
│  ├─ models/
│  │  ├─ schema.py             # estados dos grafos e RouterSchema
│  │  └─ db.py                 # modelos SQLAlchemy (seção 3)
│  ├─ utils/
│  │  ├─ llm_pick.py           # pick_llm("low"|"medium"|"high"), modelos lidos de env
│  │  ├─ database.py           # engine e sessão SQLAlchemy
│  │  ├─ workout_tools.py      # tools tipadas (análogo a etl_tools.py)
│  │  └─ whatsapp.py           # WhatsAppGateway + EvolutionGateway
│  ├─ domain/                  # adicional: lógica determinística pura (sem LLM, sem I/O)
│  │  ├─ progression.py
│  │  ├─ one_rm.py
│  │  ├─ sessions.py
│  │  └─ volume.py
│  ├─ services/                # adicional: casos de uso (usam domain + db)
│  ├─ api/                     # adicional (FastAPI): rotas do site com JWT do Clerk
│  ├─ webhook/                 # adicional (FastAPI): POST da Evolution -> inbox
│  ├─ workers/                 # adicional: processador do inbox e lembretes (APScheduler)
│  └─ tests/
├─ frontend/                   # Vite + React + TS + Tailwind + shadcn/ui
└─ PLAN.md
```

Regra de dependência: `domain` não importa nada de fora. `agents` e `utils/workout_tools.py` chamam `services`, nunca o banco direto.

### Padrão do agente (herdado do repo)
- `router_node` classifica a mensagem com `llm.with_structured_output(RouterSchema)` (`Literal`: `log_set | correct_set | routine | progress | feedback | general`) e despacha com `add_conditional_edges`.
- Cada rota é um nó que invoca um subagente compilado. O estado é Pydantic com `messages: Annotated[list, add]`.
- `python -m agents.iron_agent` fica como REPL de desenvolvimento.

### Onde o Iron diverge do repo (de propósito)
- O repo deixa o LLM gerar SQL e código Pandas. O Iron não: só tools tipadas chamando `services`. Não existe nó "juiz de SQL".
- Sem `sys.path.append`: o backend roda como pacote a partir de `backend/`.
- SQLAlchemy com pool no lugar de uma conexão psycopg2 por chamada.

## 3. Modelo de dados

- `users`: id, clerk_id (único), timezone, reminder_time, weight_increment_kg, created_at
- `whatsapp_links`: id, user_id (único), phone_e164 (único), linked_at
- `link_codes`: id, user_id, code_hash, expires_at, used_at
- `link_attempts`: phone_e164, attempted_at (para limitar tentativas)
- `exercises`: id, canonical_name (único), muscle_group; `exercise_aliases`: alias → exercise_id
- `routines`: id, user_id, active
- `workouts`: id, routine_id, name, position, weekday_hint
- `workout_exercises`: id, workout_id, exercise_id, position, sets_count
- `sessions`: id, user_id, workout_id (nulo se avulso), local_date, started_at
- `set_logs`: id, session_id, exercise_id, set_number, reps, weight_kg, supersedes_id (correção), created_at
- `targets`: user_id, exercise_id, set_number → reps, weight_kg (único por trio)
- `inbox`: id, message_id (único), phone_e164, user_id, payload jsonb, status (pending/processing/done/failed), attempts, received_at
- `pending_confirmations`: id, user_id, kind, payload jsonb, expires_at
- `reminder_log`: user_id, local_date (PK composta)
- `daily_usage`: user_id, local_date, message_count
- `feedback`: id, user_id, text, created_at

Índices: `set_logs(session_id, exercise_id)`, `sessions(user_id, local_date)`, `inbox(status, received_at)`.

## 4. Fases

### Fase 0 — Fundação
1. Confirmar versões atuais via documentação: LangChain/LangGraph, Evolution API v2, Clerk (React e verificação de JWT no backend), SQLAlchemy 2.x, APScheduler 3.x.
2. Criar o monorepo, `docker-compose.yml` (Postgres local, Evolution API, backend), `.env.example`.
3. Backend: FastAPI, config, conexão com o Neon, Alembic e a migração inicial com o modelo acima.
4. Sentry no backend e no frontend.

**Pronto quando:** `docker compose up` sobe tudo e `alembic upgrade head` roda.

### Fase 1 — Domínio determinístico (antes de qualquer LLM)
1. `progression.py`: `next_target(current_target, done_reps, done_kg, increment)`. Bateu → +1 rep até 12. Com 12 reps → 8 reps e +increment. Não bateu → mantém.
2. `one_rm.py` (Epley), `volume.py` (reps × kg somados) e `sessions.py` (dia local com virada às 04:00).
3. Testes unitários com pytest, incluindo bordas: 11→12, 12→8 com +5kg, série abaixo da meta, peso diferente da meta, virada às 03:59 e 04:00, fusos distintos.

**Pronto quando:** cobertura alta e todos os casos de borda passando.

### Fase 2 — Mensageria confiável
1. `WhatsAppGateway` (interface) e `EvolutionGateway` (envio e parse do webhook).
2. Webhook: valida o segredo, grava em `inbox` com `ON CONFLICT DO NOTHING` e responde 200.
3. Worker: pega `pending` com `FOR UPDATE SKIP LOCKED`, processa serial por usuário, com retry e backoff até `failed` (vai para o Sentry).
4. Número desconhecido: se a mensagem for um código válido, vincula; senão responde com o link do site.
5. Vínculo: gerar e validar código (hash, expiração, uso único, limite de tentativas).
6. Limite diário: acima de ~100 msgs, aviso fixo sem LLM.

**Pronto quando:** mensagens duplicadas são ignoradas, a ordem por usuário é mantida e o código é consumido uma única vez.

### Fase 3 — Agente (LangGraph)
1. Roteador de intenção seguindo o padrão do `ai_data_agent`. Intenções: registrar série, corrigir, criar/importar rotina, confirmar/cancelar, consultar evolução, feedback, conversa geral.
2. Tools tipadas (Pydantic): `log_set`, `correct_last_set`, `propose_routine`, `confirm_routine`, `get_progress`, `get_next_workout`, `send_feedback`. Sem SQL e sem código gerado.
3. Catálogo de exercícios com aliases e normalização (ex.: "supino" → "supino reto" pede esclarecimento se ambíguo).
4. Fluxo de rotina: importar ou gerar (perguntando objetivo, dias, nível e equipamentos) → resumo → `pending_confirmations` → salva só após confirmação.
5. Após cada série, `services` atualiza `targets` via `progression.py`. O LLM só redige a resposta.
6. Testes com LLM mockado: parsing de frases reais ("supino reto 1 serie 10kg", "errei, foi 25kg") e do fluxo de confirmação.

**Pronto quando:** o fluxo completo (vincular → rotina → registrar → corrigir → evolução) funciona por mensagens simuladas.

### Fase 4 — Lembretes
1. APScheduler iniciado só na réplica única (flag `RUN_SCHEDULER`).
2. A cada minuto, busca usuários cujo `reminder_time` local chegou, hoje é dia de treino e não há série no dia.
3. Insere em `reminder_log` antes de enviar (a chave única impede duplicidade). Mensagem formatada com as metas por exercício e série.

**Pronto quando:** reiniciar o processo no horário não gera lembrete duplicado.

### Fase 5 — API e site
1. Backend: verificação do JWT do Clerk e rotas `/me`, `/link-code`, `/routine`, `/sessions`, `/progress/{exercise}`, `/settings`.
2. Frontend: landing, login (Clerk), vincular WhatsApp (código e botão "Abrir WhatsApp" com mensagem preenchida), dashboard (próximo treino e metas), rotina, histórico, gráficos de progresso (carga, 1RM, volume) e configurações (horário, incrementos, fuso).
3. Estados vazios, de carregamento e de erro em todas as telas.

**Pronto quando:** um usuário novo cria conta, vincula o número e vê os dados no site.

### Fase 6 — Entrega
1. Dockerfile do backend, deploy em host com 1 réplica, Evolution API em host persistente e frontend em hospedagem estática.
2. CI com lint, testes e build.
3. Alertas no Sentry: falha no worker, webhook sem resposta, erro do LLM e limite de uso.
4. Fluxo de exclusão de conta e dados (LGPD) e mascaramento do telefone nos eventos do Sentry.

## 5. Testes e critério de "pronto" da v1
- Obrigatório: testes unitários do domínio, da idempotência do webhook, do vínculo e da deduplicação do lembrete.
- Agente: testes com LLM mockado e um conjunto pequeno de frases reais.
- Definição de pronto: o fluxo ponta a ponta funciona num número real com 2 a 3 usuários piloto, sem lembrete duplicado e sem série perdida.

## 6. Riscos
- **Banimento do Baileys:** usar chip dedicado e manter o gateway trocável pela Cloud API.
- **Ambiguidade de parsing:** catálogo com aliases e pedido de esclarecimento em caso de dúvida.
- **Custo do LLM:** limite diário por usuário e modelo mini.
- **Réplica única:** ponto único de falha. Aceito na v1, mitigado pelo `inbox` durável.
- **PII:** telefone e dados de treino exigem política de retenção e exclusão.
