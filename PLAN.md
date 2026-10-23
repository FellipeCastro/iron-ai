# Iron AI — Plano de Implementação (v1)

Agente de IA no Telegram que registra séries de academia e conduz a progressão de carga. O site serve para cadastro (Clerk), vínculo da conta do Telegram e acompanhamento dos dados. O WhatsApp fica para uma versão futura (seção 8).

O trabalho está dividido em duas trilhas: **Backend** (FastAPI + agente LangGraph) e **Frontend** (React). As dependências entre elas estão na seção 5.

## 1. Decisões fechadas

| Tema | Decisão |
|---|---|
| Canal (v1) | Telegram, via Bot API oficial com webhook. Um bot do Iron (criado no BotFather), atrás de uma interface `MessagingGateway`. WhatsApp fica para o futuro (seção 8) |
| Progressão | Por série. Bateu a meta → meta+1 rep até 12. Com 12 reps → 8 reps e +5kg (incremento configurável). Não bateu → mantém a meta |
| Rotina | Sequência rotativa A→B→C. O próximo treino é o seguinte ao último concluído |
| Exercício novo | Sem meta inicial. A meta nasce da primeira série registrada |
| Fuso e sessão | Fuso do usuário (padrão America/Sao_Paulo). Sessão = dia local, com virada às 04:00 |
| Mensagens | Webhook grava em `inbox` (chave única pelo `update_id`) e responde 200. Um worker processa em ordem, um usuário por vez |
| Lembrete | Enviado no horário do treino informado pelo usuário, só nos dias de treino (`users.training_days`; sem dias, usa o `weekday_hint` de cada treino). Pula se já houve série no dia. Dedup por (usuário, dia) |
| Onboarding | O Iron pergunta o treino (exercícios e séries), os dias da semana e o horário do treino. A rotina é salva direto, sem confirmação, e o Iron envia o link do site para o usuário conferir e editar |
| Resumo pós-treino | Enviado quando o usuário avisa "terminei", quando todos os exercícios fecham, ou depois de 45 min sem série. Números calculados em `services`, sem LLM; um resumo por sessão (`sessions.summary_sent_at`) |
| Relatórios | Evolução por exercício ou grupo muscular (30d, 90d ou tudo) pelo Telegram: carga, recorde, 1RM, volume, frequência e estagnação |
| Vínculo | Deep link `t.me/<bot>?start=IRON-XXXX`: o Telegram entrega o código ao bot. Código de uso único, expira em 15 min, 1 conta do Telegram por usuário, tentativas limitadas por `chat_id`. Fallback: o usuário envia o código digitado |
| Escala | Piloto de ~50 usuários, limite de ~100 msgs/dia por usuário |
| LLM | OpenAI, modelo mini. Só interpreta e redige. Usa apenas tools tipadas |
| Hosting | Docker com 1 réplica (Render, Railway ou Fly), com URL pública HTTPS (exigida pelo webhook do Telegram) |

### Assumptions
- 1RM pela fórmula de Epley: `kg × (1 + reps/30)`.
- Correção de uma série ("errei, foi 25kg") altera a última registrada. Correção de várias séries ("mandei errado, foi assim:" + lista) substitui as séries 1, 2, 3... do exercício citado (`correct_sets`). Registrar uma série com número já existente no dia também substitui a antiga; o histórico mantém a original via `supersedes_id`.
- Respostas do Iron são curtas: a confirmação termina nos dados registrados e, ao fechar o exercício, no próximo ("Próximo: crucifixo (3 séries)"). Sem perguntas de fechamento.
- Exercício fora da rotina é registrado como avulso, sem meta.
- Confirmações pendentes (ex.: correção ambígua) ficam no Postgres e usam botões inline do Telegram (`callback_query`).
- O limite do Telegram (~1 msg/s por chat) é suficiente para o piloto.
- Em dev local não há URL pública: usar long polling (script de desenvolvimento) ou um túnel (cloudflared/ngrok) no lugar do webhook.
- Ambientes: local (docker-compose) e produção. Sem staging.
- Idioma: pt-BR.

## 2. Arquitetura

### 2.1 Backend

Segue a arquitetura do [ai_data_agent](https://github.com/FellipeCastro/ai_data_agent): um agente principal com `router_node` que despacha para subagentes LangGraph, estados Pydantic em `models/schema.py`, `utils/llm_pick.py` para escolher o modelo, `utils/database.py` e `utils/*_tools.py` para as tools, gerenciado com uv. A FastAPI é a casca que expõe o webhook e a API do site e hospeda o worker e o scheduler.

Estado atual: `backend/` já tem `pyproject.toml` (uv, FastAPI) e o pacote em `src/backend/`. O código vive nesse pacote, então o REPL roda como `uv run python -m backend.agents.iron_agent`.

```
backend/
├─ pyproject.toml              # uv, Python >=3.14
├─ docker-compose.yml          # postgres local e backend
├─ alembic.ini + alembic/      # migrações
└─ src/backend/
   ├─ main.py                  # FastAPI (app + lifespan: sobe worker do inbox e scheduler)  [ai_data_agent: main.py]
   ├─ config.py                # settings lidas de env
   ├─ agents/                  # [ai_data_agent: agents/]
   │  ├─ iron_agent.py         # grafo principal: router_node + conditional edges   (≙ data_agent.py)
   │  └─ subagents.py          # subagentes tool-calling: logger, routine, progress, report
   ├─ models/
   │  ├─ schema.py             # estados dos grafos e RouterSchema                   (≙ Models/schema.py)
   │  └─ db.py                 # modelos SQLAlchemy (seção 3)
   ├─ utils/
   │  ├─ llm_pick.py           # pick_llm("low"|"medium"|"high"), modelos lidos de env (≙ llm_pick.py)
   │  ├─ database.py           # engine e sessão SQLAlchemy                          (≙ database.py)
   │  ├─ workout_tools.py      # tools tipadas                                       (≙ etl_tools.py)
   │  ├─ messaging.py          # interface MessagingGateway (send_text, send_buttons, parse_update)
   │  ├─ telegram.py           # TelegramGateway (v1)
   │  └─ whatsapp.py           # WhatsAppGateway (futuro, seção 8)
   ├─ domain/                  # adicional: lógica determinística pura (sem LLM, sem I/O)
   │  ├─ progression.py
   │  ├─ one_rm.py
   │  ├─ sessions.py
   │  └─ volume.py
   ├─ services/                # adicional: casos de uso (workouts, catalog, linking, users, stats, reports, chat, confirmations, inbox, conversation)
   ├─ api/                     # adicional (FastAPI): rotas do site, com JWT do Clerk
   ├─ webhook/                 # adicional (FastAPI): POST do Telegram -> inbox e webhook do Clerk (sincroniza usuários)
   ├─ workers/                 # adicional: processador do inbox, long polling (dev) e scheduler (lembretes e resumos)
   └─ tests/
```

**Regra de dependência:** `domain` não importa nada de fora. `agents` e `utils/workout_tools.py` chamam `services`, nunca o banco direto. Só `utils/telegram.py` (e no futuro `utils/whatsapp.py`) conhece o canal; o resto usa `MessagingGateway`.

**Como as peças se conectam**
- Telegram → `webhook/` (`POST /webhook/telegram`, valida o header `X-Telegram-Bot-Api-Secret-Token`) → grava em `inbox` (chave = `update_id`) → `workers/` pega a mensagem e chama `services`, que invoca `agents.iron_agent` → a resposta sai por `MessagingGateway`.
- Toques em botões inline chegam como `callback_query` e entram pelo mesmo `inbox`.
- `api/` (rotas do site) usa os mesmos `services`; não passa pelo agente.
- O `main.py` só monta o `FastAPI`, registra os routers (`api/`, `webhook/`) e controla o ciclo de vida do worker e do scheduler.

**Padrão do agente (herdado do repo)**
- `router_node` classifica a mensagem com `llm.with_structured_output(RouterSchema)` (`Literal`: `log_set | correct_set | finish | routine | progress | report | feedback | general`) e despacha com `add_conditional_edges`.
- Cada rota é um nó que invoca um subagente compilado. O estado é Pydantic com `messages: Annotated[list, add]`.
- `python -m backend.agents.iron_agent` fica como REPL de desenvolvimento, e como no repo, rodar o módulo exporta o diagrama Mermaid do grafo.

**Onde o Iron diverge do repo (de propósito)**
- O repo deixa o LLM gerar SQL e código Pandas. O Iron não: só tools tipadas chamando `services`. Não existe nó "juiz de SQL".
- Sem `sys.path.append`: o backend roda como pacote.
- SQLAlchemy com pool no lugar de uma conexão psycopg2 por chamada.

### 2.2 Frontend

Já existe: Vite + React 19 + Tailwind 4 e a landing completa em `src/components/landing/` (Header, Hero, Features, Steps, Showcase, Reminder, Faq, Footer, shared).

```
frontend/src/
├─ main.tsx, App.tsx           # providers (Clerk, router) e rotas
├─ components/
│  ├─ landing/                 # pronto (copy em Telegram)
│  ├─ ui/                      # shadcn/ui
│  └─ app/                     # componentes do app logado (layout, cards, gráficos)
├─ pages/                      # Landing, Auth, LinkTelegram, Dashboard, Routine, History, Progress, Profile (configurações)
├─ lib/api.ts                  # cliente HTTP que anexa o token do Clerk
├─ hooks/                      # dados da API (react-query ou equivalente)
└─ design/                     # referências visuais
```

Stack em uso: react-router, Clerk (React), Recharts. Pendentes: shadcn/ui e Sentry.

## 3. Modelo de dados

- `users`: id, clerk_id (único), email, name, timezone, reminder_time (horário do treino), training_days (0=segunda ... 6=domingo), weight_increment_kg, created_at
- `channel_links`: id, user_id (único), channel (`telegram` | `whatsapp`), external_id (`chat_id` no Telegram), linked_at; único em (channel, external_id)
- `link_codes`: id, user_id, code_hash, expires_at, used_at
- `link_attempts`: external_id, attempted_at (para limitar tentativas)
- `exercises`: id, canonical_name (único), muscle_group; `exercise_aliases`: alias → exercise_id
- `routines`: id, user_id, active
- `workouts`: id, routine_id, name, position, weekday_hint
- `workout_exercises`: id, workout_id, exercise_id, position, sets_count
- `sessions`: id, user_id, workout_id (nulo se avulso), local_date, started_at, summary_sent_at (resumo pós-treino já enviado)
- `set_logs`: id, session_id, exercise_id, set_number, reps, weight_kg, supersedes_id (correção), created_at
- `targets`: user_id, exercise_id, set_number → reps, weight_kg (único por trio)
- `inbox`: id, update_id (único por canal), channel, external_id, user_id, payload jsonb, status (pending/processing/done/failed), attempts, received_at
- `pending_confirmations`: id, user_id, kind, payload jsonb, expires_at
- `reminder_log`: user_id, local_date (PK composta)
- `daily_usage`: user_id, local_date, message_count
- `feedback`: id, user_id, text, created_at
- `chat_messages`: id, user_id, role (`user` | `assistant`), content, created_at (histórico curto usado como contexto do agente)

Índices: `set_logs(session_id, exercise_id)`, `sessions(user_id, local_date)`, `inbox(status, received_at)`.

## 4. Tarefas

### 4.1 Backend

#### B0 — Fundação
- [ ] Confirmar versões atuais via documentação: LangChain/LangGraph, Telegram Bot API, verificação de JWT do Clerk, SQLAlchemy 2.x, APScheduler 3.x.
- [x] `pyproject.toml`: adicionar langchain, langgraph, langchain-openai, pydantic, sqlalchemy, alembic, apscheduler, sentry-sdk, pytest e um cliente HTTP (httpx).
- [x] Estrutura de pastas da seção 2.1, `config.py` e `.env.example` (token do bot, username do bot, secret do webhook).
- [ ] Criar o bot no BotFather.
- [x] `docker-compose.yml` (Postgres local e backend).
- [x] `utils/database.py` (engine + sessão), `models/db.py` e Alembic com a migração inicial (seção 3), apontando para o Neon em produção.
- [x] `main.py` com FastAPI, rota de health e Sentry.

**Pronto quando:** `docker compose up` sobe tudo e `alembic upgrade head` roda.

#### B1 — Domínio determinístico (antes de qualquer LLM)
- [x] `progression.py`: `next_target(current_target, done_reps, done_kg, increment)`. Bateu → +1 rep até 12. Com 12 reps → 8 reps e +increment. Não bateu → mantém.
- [x] `one_rm.py` (Epley), `volume.py` (reps × kg somados) e `sessions.py` (dia local com virada às 04:00).
- [x] Testes com pytest, incluindo bordas: 11→12, 12→8 com +5kg, série abaixo da meta, peso diferente da meta, virada às 03:59 e 04:00, fusos distintos.

**Pronto quando:** cobertura alta e todos os casos de borda passando.

#### B2 — Mensageria confiável
- [x] `utils/messaging.py` (`MessagingGateway`) e `utils/telegram.py` (`TelegramGateway`: envio de texto e botões, parse de `message` e `callback_query`).
- [x] `webhook/`: `setWebhook` com `secret_token`, valida o header, grava em `inbox` com `ON CONFLICT DO NOTHING` (chave `update_id`) e responde 200.
- [x] `workers/`: pega `pending` com `FOR UPDATE SKIP LOCKED`, processa serial por usuário, com retry e backoff até `failed` (vai para o Sentry).
- [x] Chat desconhecido: `/start <código>` válido vincula; qualquer outra mensagem (inclusive `/start` sem código) responde com o link do site.
- [x] Vínculo: gerar e validar código (hash, expiração, uso único, limite de tentativas por `chat_id`).
- [x] Botões inline para confirmações (rotina, correção ambígua).
- [x] Modo long polling para desenvolvimento local, usando o mesmo `inbox`.
- [x] Limite diário: acima de ~100 msgs, aviso fixo sem LLM (`daily_usage`).

**Pronto quando:** updates duplicados são ignorados, a ordem por usuário é mantida e o código é consumido uma única vez.

#### B3 — Agente (LangGraph)
- [x] `utils/llm_pick.py` e `models/schema.py` (`RouterSchema`, estados dos subagentes).
- [x] `agents/iron_agent.py`: roteador de intenção no padrão do `data_agent.py`. Intenções: registrar série, corrigir, fechar treino, cadastrar rotina, consultar evolução, relatório, feedback, conversa geral.
- [x] `utils/workout_tools.py`: tools tipadas (Pydantic) `log_set`, `log_sets`, `correct_last_set`, `correct_sets`, `get_next_workout`, `get_progress`, `get_report`, `save_routine` (rotina + dias de treino + horário do treino), `send_feedback`. Sem SQL e sem código gerado.
- [x] Subagentes em `subagents.py`: `workout_logger`, `routine_builder`, `progress_analyst` e `report_analyst`.
- [x] Catálogo de exercícios com aliases e normalização (ex.: "supino" → "supino reto" pede esclarecimento se ambíguo).
- [x] Fluxo de rotina (onboarding): o usuário conta o treino, os dias da semana e o horário do treino → `save_routine` salva direto → o Iron envia o link do site para conferir e editar.
- [x] Após cada série, `services` atualiza `targets` via `progression.py`. O LLM só redige a resposta.
- [x] Registro de várias séries e vários exercícios em uma mensagem (`log_sets`); correção de várias séries de um exercício (`correct_sets`); número de série existente substitui a série antiga.
- [x] Resumo pós-treino (`finish`): ao avisar "terminei", ao fechar todos os exercícios ou após 45 min sem série; mostra metas batidas, recordes e variação de volume.
- [x] Relatórios de evolução por exercício ou grupo muscular (`get_report`).
- [x] Testes com LLM mockado: parsing de frases reais ("supino reto 1 serie 10kg", "errei, foi 25kg") e do fluxo de confirmação.

**Pronto quando:** o fluxo completo (vincular → rotina → registrar → corrigir → evolução) funciona por mensagens simuladas.

#### B4 — Lembretes
- [x] APScheduler iniciado só na réplica única (flag `RUN_SCHEDULER`).
- [x] A cada minuto, busca usuários cujo horário do treino (`reminder_time`) local chegou, hoje é um dos `training_days` e não há série no dia.
- [x] A cada 5 minutos, envia o resumo das sessões paradas há 45 min que o usuário não fechou.
- [x] Insere em `reminder_log` antes de enviar (a chave única impede duplicidade). Mensagem formatada com as metas por exercício e série.
- [ ] O Telegram não tem janela de 24h nem templates: o bot pode enviar o lembrete a qualquer momento depois que o usuário o iniciou.

**Pronto quando:** reiniciar o processo no horário não gera lembrete duplicado.

#### B5 — API do site
- [x] Verificação do JWT do Clerk (dependency do FastAPI) e criação do `users` no primeiro acesso.
- [x] Rotas em `api/`: `GET /me`, `POST /link-code` (devolve o código, a expiração e o `deep_link` `t.me/<bot>?start=<código>`), `GET/PUT /routine`, `GET /sessions`, `GET /dashboard`, `GET /records`, `GET /exercises`, `GET /progress/{exercise}`, `GET/PUT /settings` (horário do treino, dias de treino, incremento e fuso), `DELETE /me` (LGPD).
- [x] Schemas Pydantic de resposta e contrato OpenAPI estável (o frontend consome).
- [x] CORS para o domínio do frontend.

**Pronto quando:** todas as rotas respondem com um JWT válido, rejeitam sem JWT e o OpenAPI está publicado.

#### B6 — Entrega
- [x] Dockerfile do backend e deploy em host com 1 réplica e HTTPS público; registrar o webhook do Telegram em produção.
- [x] CI com lint, testes e build.
- [ ] Alertas no Sentry: falha no worker, webhook sem resposta, erro do LLM e limite de uso.
- [x] Exclusão de conta e dados (LGPD) e mascaramento do `chat_id` nos eventos do Sentry.

**Pronto quando:** deploy em produção estável com o fluxo funcionando num bot real.

### 4.2 Frontend

#### F0 — Setup
- [ ] Instalar react-router, Clerk (React), shadcn/ui, Recharts e Sentry.
- [ ] Estrutura de pastas da seção 2.2, `.env.example` (chave pública do Clerk, URL da API).
- [x] `lib/api.ts`: cliente HTTP que anexa o token do Clerk e trata erros.
- [x] Roteamento em `App.tsx` (rotas públicas e protegidas).

**Pronto quando:** o app sobe com Clerk configurado e chama `GET /me` do backend (ou um mock).

#### F1 — Landing
- [x] Componentes: Header, Hero, Features, Steps, Showcase, Reminder, Faq, Footer (`components/landing/`).
- [x] Copy em Telegram.
- [ ] Revisar os mockups de conversa e a seção "Lembretes" para o texto atual do Iron.
- [ ] Ligar os CTAs ao login/cadastro do Clerk e ao fluxo de vínculo.

**Pronto quando:** a landing é a rota `/`, não cita WhatsApp e os CTAs levam ao cadastro.

#### F2 — Autenticação e vínculo do Telegram
- [x] Páginas de login e cadastro (Clerk) e rotas protegidas.
- [x] Tela de vínculo: gera o código (`POST /link-code`), mostra a expiração (15 min), botão "Abrir Telegram" com o `deep_link` devolvido pela API, fallback exibindo o código para enviar ao bot e atualização do status quando a conta for vinculada.

**Pronto quando:** um usuário novo cria conta e vincula o Telegram.

#### F3 — Dashboard, rotina e histórico
- [x] Dashboard: próximo treino, metas por exercício e série, métricas, recordes e visualizações por período.
- [x] Rotina: visualizar a rotina ativa (A/B/C, exercícios, séries).
- [x] Histórico: lista de sessões e séries registradas.

**Pronto quando:** o usuário vê no site os dados registrados pelo Telegram.

#### F4 — Progresso e configurações
- [x] Gráficos por exercício: carga, 1RM e volume.
- [x] Perfil e configurações: dados da conta, status do vínculo do Telegram, horário do treino, dias de treino, incremento de carga, fuso e exclusão de conta.

**Pronto quando:** alterar uma configuração no site muda o comportamento do Iron (lembrete e incremento).

#### F5 — Qualidade e entrega
- [x] Estados vazio, de carregamento e de erro em todas as telas; layout responsivo (mobile-first).
- [ ] Testes dos fluxos principais (vínculo, dashboard).
- [ ] Build, deploy em hospedagem estática e CI (lint + build).
- [ ] Sentry no frontend.

**Pronto quando:** build de produção publicado e sem erros no fluxo ponta a ponta.

## 5. Dependências entre as trilhas

| Frontend | Precisa do Backend | Como avançar em paralelo |
|---|---|---|
| F0 | B0 (health), B5 (JWT) | mock do `/me` |
| F2 | B5 `POST /link-code` (com `deep_link`), B2 (`/start` com código) | mock do código, do `deep_link` e do status |
| F3 | B5 `/routine`, `/sessions`, `/me` | mocks com o contrato OpenAPI |
| F4 | B5 `/progress/{exercise}`, `/settings` | mocks com o contrato OpenAPI |
| F5 / deploy | B6 | — |

Ordem sugerida: B0 → B1 → B2 → B3 → B4 em sequência no backend; o contrato da B5 deve ser definido cedo para liberar F2–F4 em paralelo às fases B2–B4.

## 6. Testes e critério de "pronto" da v1
- Obrigatório (backend): testes unitários do domínio, da idempotência do webhook, do vínculo e da deduplicação do lembrete.
- Agente: testes com LLM mockado e um conjunto pequeno de frases reais.
- Frontend: testes dos fluxos de vínculo e dashboard.
- Definição de pronto: o fluxo ponta a ponta (cadastro no site → vínculo → registro pelo Telegram → dados no site) funciona num bot real com 2 a 3 usuários piloto, sem lembrete duplicado e sem série perdida.

## 7. Riscos
- **Adoção do Telegram no Brasil:** menor que a do WhatsApp. Aceito no piloto; a v1 valida o produto e o `MessagingGateway` permite adicionar o WhatsApp depois.
- **Notificações silenciadas:** chats do Telegram costumam ficar mudos, o que reduz o efeito do lembrete. Mitigar no onboarding (orientar a manter o bot com notificação ativa).
- **Webhook:** exige HTTPS público estável. Mitigar com health check e alerta no Sentry; polling só para dev.
- **Retrabalho na migração para o WhatsApp:** mitigado por `MessagingGateway` e `channel_links` genéricos.
- **Ambiguidade de parsing:** catálogo com aliases e pedido de esclarecimento em caso de dúvida.
- **Custo do LLM:** limite diário por usuário e modelo mini.
- **Réplica única:** ponto único de falha. Aceito na v1, mitigado pelo `inbox` durável.
- **PII:** `chat_id` e dados de treino exigem política de retenção e exclusão.
- **Contrato da API:** mudanças tardias na B5 quebram o frontend; fechar o OpenAPI cedo.

## 8. Evolução futura: WhatsApp
- Implementar `utils/whatsapp.py` (`WhatsAppGateway`) atrás de `MessagingGateway`, preferindo a Cloud API oficial da Meta à Evolution/Baileys, que não é oficial e tem risco de banimento.
- O modelo já comporta o canal (`channel_links.channel`, `inbox.channel`); adicionar `POST /webhook/whatsapp` gravando no mesmo `inbox`.
- A tratar: janela de 24h e templates aprovados para lembretes; vínculo por código digitado (não há deep link de bot); telefone passa a ser PII (mascaramento e LGPD); landing e tela de vínculo com escolha do canal.
- `domain`, `services` e `agents` não devem mudar.
