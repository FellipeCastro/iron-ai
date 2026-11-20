# Refatoração em camadas dos arquivos grandes (sem mudar comportamento)

## Status (atualizado após o passo 11)

| Bloco | Passos | Estado |
|---|---|---|
| Baseline e testes de caracterização | 0 | ✅ concluído |
| Bot (`lib/bot/handle-update.ts`) | 1–11 | ✅ **fechado**: suíte completa verde |
| Treino (`lib/services/workout.ts`) | 12–21 | ⏳ próximo: passo 12 |
| Ações e UI | 22–26 | ⏳ pendente |

**Números até aqui**
- `handle-update.ts`: 677 → **249 linhas**, sem acesso direto ao banco. Módulos novos de 17 a 216 linhas.
- Testes unitários: 131 → **137** (6 novos em `tests/engine/match.test.ts`).
- Testes de integração: 233 → **295**, todos verdes (62 novos em `tests/integration/15-bot-fluxos.test.ts`: 55 de fluxos + 7 de falha do modelo).
- `typecheck` limpo; `lint` igual ao baseline (0 erros, 8 avisos já existentes).

**Como rodar a verificação neste ambiente (aprendido no passo 0)**
- Rodar **pelo PowerShell**. O Git Bash abre o cwd como `c:\...` (minúsculo) e o Vitest falha com `Cannot read properties of undefined (reading 'config')`, porque carrega o módulo duas vezes. Não é bug do projeto, do `node_modules` nem do lockfile (comprovado com instalações limpas).
- Por passo: `npm run typecheck`, `npm run lint`, `npm test` (segundos) + integração do bloco: `15-bot-fluxos`, `08-bot`, `13-concorrencia` (~6,5 min, em primeiro plano). Para o treino, incluir também `06-treino-web`.
- Suíte completa de integração: ~12 min. Roda em segundo plano; **não editar código enquanto ela roda** (os arquivos são carregados aos poucos e o resultado se mistura).
- A integração só roda contra o banco de teste (`.env.test`); as travas de `tests/integration/env.ts` conferem o host antes do `TRUNCATE`.
- Teste intermitente já conhecido: `14-idempotencia-pagamentos` › "antecessor ainda vivo falha depois da tomada…" falhou 1 vez no baseline e passou isolado e na suíte final.

**Desvios do plano original (todos sem mudar comportamento)**
- Passo 3 foi reexecutado: a primeira verificação foi interrompida com a sessão e não valeu; os 4 arquivos de integração passaram na segunda.
- Passo 4: `rankPool` recebe listas de ids (`routine`, `today`, `session`) em vez dos objetos da rotina.
- Passo 6: o tipo `Out` mora em `deliver.ts` (exportado), porque `intents`, `onboarding`, `commands` e `callbacks` também o usam.
- Passo 7: `onboarding.ts` também trata o passo `duration_edit` (duração digitada), por ser o mesmo mecanismo de `handleAwaitedText`.
- Passo 8: `CONFIRM_BELOW` é definido em `intents.ts` e reexportado por `handle-update.ts` (nome público preservado).
- Passo 11: além de unificar o helper (`failedModelCall`), acrescentei 7 testes de caracterização das falhas do modelo; eles passam no código original (commit `HEAD`) e no refatorado.
- Os comportamentos suspeitos encontrados estão em `tests/BUGS.md` (S1 a S6). Nenhum foi corrigido.
- Este `PLAN.md` é uma cópia do plano aprovado (original em `~/.claude/plans/`) e ainda não está versionado.

## Contexto
Vários arquivos cresceram e misturam camadas; mexer num ponto quebra outro. Objetivo: separar **UI / regra de negócio / acesso a dados** seguindo o padrão que o projeto já tem — `lib/engine/*` (regras puras, com testes unitários em `tests/engine`), `lib/services/*` (banco/Stripe/etc.), `lib/telegram/render.ts` (UI do bot), `components/*` (UI web). Nada de lib nova, mesmos nomes públicos, mesmos caminhos de import, sem renomear rotas/props/colunas.

## Triagem: o que entra e o que fica
| Arquivo | Linhas | Decisão |
|---|---|---|
| `lib/bot/handle-update.ts` | 677 | **Refatorar** (prioridade 1) — mistura fluxo, regra e escrita direta no banco |
| `lib/services/workout.ts` | 595 | **Refatorar** (prioridade 2) — regras puras escondidas dentro de I/O |
| `components/app/routine-editor.tsx` | 439 | **Refatorar** (prioridade 3) — UI + regras do editor + duplicações |
| `app/(app)/actions.ts` | 318 | **Ajuste pequeno** — só tirar 2 escritas diretas no banco |
| `components/app/session-edit-tools.tsx` | 249 | **Ajuste pequeno** — reaproveitar a busca de exercício extraída do editor |
| `lib/telegram/render.ts` | 357 | Não mexer: já é 100% camada de UI (templates), coeso |
| `lib/limits.ts` | 299 | Não mexer: 100% dados/config, coeso e muito testado (07, 13) |
| `app/(app)/dashboard/page.tsx`, `app/page.tsx` | 246/543 | Não mexer: UI pura (cálculos triviais) |
| `db/schema.ts`, páginas legais, testes | — | Fora de escopo (colunas / texto estático) |

## 1. Mapa por camada

### `lib/bot/handle-update.ts`
- **UI (bot)**: `deliver` (envio/edição de mensagens), montagem dos `Out[]` com `render.*` e teclados.
- **Regra de negócio**: `slots`, `isWrite`, decisão de confirmação (`CONFIRM_BELOW`), `exerciseFork`, cálculo de prioridade do `pool`, `handleCommand` (roteamento), `handleCallback` (máquina de estados dos botões), `handleAwaitedText` (validação de dias/hora/duração), `execute`/`apply`/`reportText`/`chooseDay`/`finishWorkout`/`proposeRoutine` (orquestração).
- **Dados**: linha de `messages` (insert/`finish`/update de `userId` e `rawText`), `saveState` (grava `telegram_links.chat_state`), `handleAwaitedText` e `finishOnboarding` gravam `users.training_days`/`reminder_time` direto, `loadCtx`, `currentDay`, `parserContext`, `pool` (I/O + cache).

### `lib/services/workout.ts`
- **Dados**: `loadLog`, `loadTargets`, `recomputeTargets(Stable)`, `findOpenSession`, `lastTrainedLetter`, `dropSessionIfEmpty`, `closeSession`, `setSessionDuration`, `markSummarySent`, `updateAlreadyLogged`, `logSets`, `findSet`, `correctSet`/`applyCorrection`, `deleteSet`/`applyDelete`, `*ById`, `addSetToSession`, `deleteSessionById`.
- **Regra pura escondida**: `recordsFor`; o cálculo de `changes` (antes/depois das metas) em `closeSession`; a montagem das linhas (`assignSet` + peso padrão) em `logSets`; o cálculo de `remaining`/`upNext` em `logSets`; `sessionMinutes`.

### `components/app/routine-editor.tsx`
- **UI**: `RoutineEditor` (JSX), `NameField`, `SortableRow`, `IconButton`.
- **Regra**: clamp de séries, próxima letra livre, re-letreamento ao remover dia, payload do salvar (só manda `name` se mudou), aplicação do `renamed`, `dirty`, filtro de sugestões.
- **Dados**: chamada a `saveRoutineAction`.

### `app/(app)/actions.ts`
- Camada de entrada (auth + Zod + Sentry). **Dados vazando**: `saveSettingsAction` (`db.update(users)`) e `deleteAccountAction` (`db.delete(users)`).

## 2. Dependências cruzadas, duplicação, estado global
- **Estado mutável compartilhado**: `Ctx` é mutado por todos (`ctx.state` em `saveState`, `ctx.pool` como cache). Ao dividir, o `Ctx` vai para um módulo próprio e continua sendo passado por referência (mesmo comportamento).
- **Ciclo potencial** no bot: `apply → proposeRoutine/finishWorkout`, `handleCallback → execute/saveRoutineDraft`, `handleCommand → finishWorkout`. Ordem de módulos sem ciclo: `context ← onboarding ← intents ← commands/callbacks ← handle-update`.
- **Duplicado**:
  - tratamento de erro de orçamento/IA repetido 2× em `handleUpdate` (transcrição e parser; só muda a mensagem de log);
  - `LETTERS`/`MAX_SETS` no editor = `DAY_LETTERS`/`MAX_PLANNED_SETS` em `lib/services/routine.ts` (que importa `db`, por isso o client não podia usar);
  - dropdown de busca de exercício idêntico em `routine-editor.tsx` e `AddExercise` (`session-edit-tools.tsx`);
  - lógica "trava sessão + apaga se vazia" em `dropSessionIfEmpty` e repetida em `deleteExerciseFromSession` (não idêntica — fica, só anotada);
  - URL do bot `t.me/...` montada em `actions.ts` e `dashboard/page.tsx` (fica, só anotada).
- **Escrita em `telegram_links.chat_state`** também em `lib/bot/duration.ts` (fica igual).
- **Mock atenção**: `tests/route-auth.test.ts` faz `vi.mock("@/lib/services/users")` só com `ensureUser`; funções novas lá não podem ser chamadas no caminho desse teste.

## 3. Nova estrutura (só arquivos novos/alterados)
```
(✅ = já criado)
✅ lib/bot/handle-update.ts   # só handleUpdate + HandleOptions/HandleResult + failedModelCall; reexporta CONFIRM_BELOW (249 linhas)
✅ lib/bot/context.ts         # Ctx, loadCtx, saveState, chosenLetter, parserContext, pool (currentDay privado) (70)
✅ lib/bot/intents.ts         # CONFIRM_BELOW, execute, finishWorkout exportados; slots, isWrite, exerciseFork, confirmText, apply, reportText, chooseDay, summaryOut privados (216)
✅ lib/bot/onboarding.ts      # handleAwaitedText, proposeRoutine, saveRoutineDraft exportados; askTime, finishOnboarding privados (90)
✅ lib/bot/commands.ts        # handleCommand (30)
✅ lib/bot/callbacks.ts       # handleCallback (40)
✅ lib/bot/deliver.ts         # deliver + tipo Out (17)
✅ lib/services/messages.ts   # claimMessage, findMessage, finishMessage, setMessageUser, setMessageRawText
lib/services/users.ts         # ✅ saveChatState, setTrainingDays, setReminderTime; ⏳ updateSettings, deleteUserRow (passo 22)
✅ lib/engine/match.ts        # + rankPool (prioridade do pool, pura)
lib/engine/progression.ts     # + targetChanges (antes/depois, puro)
lib/engine/records.ts         # + recordsFor (puro)
lib/engine/session.ts         # + planSetRows, upNextFor, remainingNames (puros)
lib/services/workout/index.ts # re-exporta tudo (import "@/lib/services/workout" continua igual)
lib/services/workout/log.ts | sessions.ts | logging.ts | corrections.ts | site-edits.ts
lib/routine-rules.ts          # DAY_LETTERS, MAX_PLANNED_SETS sem db (services/routine re-exporta)
lib/routine-editor.ts         # transformações puras do editor
components/app/exercise-search.tsx  # dropdown compartilhado
components/app/name-field.tsx, sortable-row.tsx, icon-button.tsx
```

## 4. Testes antes do passo 1 (caracterização)
Cobertura atual (boa): `08-bot` (acesso, registro, idempotência, 90 min, orçamento, fechamento), `06-treino-web` (edições pelo site, saveRoutine, settings), `07-telegram`, `13-concorrencia`, `tests/engine/*`.
**Lacunas** → novo `tests/integration/15-bot-fluxos.test.ts` (mesmo estilo do 08, `FAST_PATH=off`, `openaiState.parsed`), registrando **texto exato** das respostas (`telegramTexts()`) e o estado do banco, mesmo que pareça errado:
1. Onboarding: `setup_routine` → rascunho + botão → "Salvar treinos" → pergunta dias → texto inválido / válido → hora inválida / "sem lembrete" / `18:30` → `users.trainingDays`, `reminderTime`, rotina salva.
2. Exercício ambíguo → teclado de escolha → callback `pick` → séries gravadas.
3. Confiança baixa → confirmação → `ok` grava / `no` cancela; callback com id velho → "não está mais disponível".
4. "Fork": série sem nome após terminar o exercício → pergunta → escolha do próximo vs extra.
5. Duração: após `terminei`, botão ok / editar → texto `50` / texto inválido curto / texto longo passa adiante.
6. `choose_day` + `/treino`; `/ajuda`, `/semana`, `/terminei` sem sessão; comando desconhecido.
7. `correct_set` e `delete_set` pelo bot (com e sem série).
8. Exercício desconhecido; áudio longo demais.
9. `logSets` direto: forma completa do retorno (`items` com `record`/`target`, `remaining`, `upNext` same/next, `opened`, `complete`).
UI do editor: não há infra de teste de componente e não vou adicionar lib → as funções puras extraídas ganham testes unitários escritos a partir do comportamento atual; a UI é verificada por typecheck/lint/build + uso manual no app.

## 5. Plano de passos (1 pedaço por passo; ao fim de cada um: `npm run typecheck && npm run lint && npm test && npm run test:integration`)
**Passo 0** ✅ — baseline: `typecheck` ok; `lint` 0 erros e 8 avisos; unitários 131 ok; integração 232 ok + 1 intermitente (`14-idempotencia`). `15-bot-fluxos` escrito (55 testes; o retorno de `logSets` e o resumo de `/terminei` ficam em snapshots inline).

Bot (`handle-update.ts`): ✅ **fechado**
1. ✅ Linha de `messages` → `lib/services/messages.ts`.
2. ✅ `saveState`'s escrita → `saveChatState` em `services/users.ts`.
3. ✅ Escritas de `trainingDays`/`reminderTime` → `setTrainingDays`/`setReminderTime` em `services/users.ts`. Depois dele, `handle-update.ts` não acessa mais o banco.
4. ✅ Prioridade do pool → `rankPool` em `engine/match.ts` (+ `tests/engine/match.test.ts`).
5. ✅ `Ctx` e funções de contexto → `lib/bot/context.ts` (`currentDay` ficou privado).
6. ✅ `deliver` e o tipo `Out` → `lib/bot/deliver.ts`.
7. ✅ Onboarding + `handleAwaitedText` → `lib/bot/onboarding.ts`.
8. ✅ Intents (`execute`, `apply`, …, `CONFIRM_BELOW`) → `lib/bot/intents.ts`; `handle-update` reexporta `CONFIRM_BELOW`.
9. ✅ `handleCommand` → `commands.ts`. 10. ✅ `handleCallback` → `callbacks.ts`.
11. ✅ Tratamento de falha de IA duplicado → helper local `failedModelCall` (mesmos logs e textos), com 7 testes novos.

Treino (`workout.ts`): ⏳ próximo. Regra deste bloco: extrair **só os trechos puros**; as consultas SQL e a lógica de concorrência/idempotência (`logSets`, `closeSession`, `dropSessionIfEmpty`, `recomputeTargets*`) não são reescritas, só movidas. Verificar com `15-bot-fluxos`, `08-bot`, `06-treino-web`, `13-concorrencia`.
12. `recordsFor` → `engine/records.ts`. 13. Cálculo de `changes` → `targetChanges` em `engine/progression.ts`. 14. Montagem de linhas → `planSetRows`. 15. `remaining`/`upNext` → `upNextFor` (cada um com teste unitário).
16. `git mv workout.ts workout/index.ts` (sem mudar conteúdo).
17–21. Mover para `log.ts`, `sessions.ts`, `logging.ts`, `corrections.ts`, `site-edits.ts` (um por passo; `index.ts` só re-exporta).

Ações e UI: ⏳ pendente
22. `saveSettingsAction`/`deleteAccountAction`: escrita no banco → `updateSettings`/`deleteUserRow` em `services/users.ts`.
23. `DAY_LETTERS`/`MAX_PLANNED_SETS` → `lib/routine-rules.ts` (re-export em `services/routine`); editor passa a usá-los no lugar de `LETTERS`/`MAX_SETS` (mesmos valores).
24. Transformações do editor → `lib/routine-editor.ts` (+ testes unitários).
25. `ExerciseSearch` extraído e usado no editor e em `AddExercise` (mesmo markup/classes).
26. `NameField`, `SortableRow`, `IconButton` → arquivos próprios.

Cada passo vira um commit separado (só se você pedir commit), facilitando reverter um passo isolado.

## Lista separada de bugs/suspeitas (não corrigir; registrada em `tests/BUGS.md`, seção "Comportamentos suspeitos")
- **S1** `handleAwaitedText` (dias): qualquer texto sem `/` é consumido pelo passo, inclusive "supino 10x20"; no passo de duração, texto com mais de 10 caracteres passa adiante. Regras diferentes. (Confirmado por teste.)
- **S2** Botão "Cancelar" num passo de duração: responde "não está mais disponível" e apaga o passo. (Confirmado por teste.)
- **S3** `handleUpdate`: `if (!text) return { status: "ignored" }` após a transcrição sai sem `finish()` (provavelmente inalcançável). Só leitura do código.
- **S4** `render.muscleGroupReportText` formata queda como `-8%` (hífen); `periodReportText` usa `−8%` (sinal de menos). Só leitura do código.
- **S5** `messagesThisMonth` não tem limite superior de data dentro do mês. Só leitura do código.
- **S6** `14-idempotencia-pagamentos` › "antecessor ainda vivo falha depois da tomada…": intermitente (falhou 1 vez no baseline).
(Novos achados durante a execução entram aqui e em `tests/BUGS.md`.)

## Verificação final
- As 4 verificações verdes, sem testes novos falhando além do baseline.
- `npm run build`.
- Manual: no app, editar rotina (adicionar/reordenar/renomear/salvar/descartar), editar sessão no histórico (adicionar série/exercício, excluir); no bot (ambiente dev), registrar série, corrigir, terminar e confirmar duração.
