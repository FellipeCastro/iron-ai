# Bugs encontrados pelos testes de integração

Testes que falham por bug real ficam falhando (não são apagados, pulados nem afrouxados) e são listados aqui.
Todos os bugs abaixo foram **confirmados por execução** contra o banco de teste.

| # | Teste que falha | Bug | Onde |
|---|-----------------|-----|------|
| 1 ✅ **corrigido** | `01-cadastro` › "quando user.deleted roda, então o cliente Stripe dele é cancelado" | _Corrigido: a tarefa agora apaga o cliente no Stripe antes de apagar o usuário (falha do Stripe → erro e retry, com o usuário preservado; cliente já inexistente é tolerado)._ Antes: a tarefa `clerk-user-deleted` só apaga o usuário no banco. Nunca chama o Stripe: o cliente e a assinatura continuam sendo cobrados. | `trigger/clerk-users.ts` |
| 2 ✅ **corrigido** | `02-acesso` › "quando a assinatura está active mas current_period_end já passou, então o acesso é totalmente removido" | _Corrigido: `hasAccess` agora também exige `current_period_end` no futuro para `active` e `trialing` (`past_due` fica de fora, pois o período já venceu enquanto o Stripe tenta o cartão)._ Antes: `hasAccess` só olhava o `status`. Assinatura `active` com período vencido ainda dá acesso. | `lib/services/access.ts` |
| 3 ✅ **corrigido** | `03-checkout` › "quando o usuário clica 2 vezes ao mesmo tempo, então só 1 Checkout Session é criada" | _Corrigido: a sessão agora usa `idempotencyKey` por usuário, plano e minuto._ Antes: `checkout.sessions.create` era chamado sem `idempotencyKey` (o cliente Stripe tem, a sessão não): cada clique cria uma sessão. | `lib/services/billing.ts` (`createCheckoutUrl`) |
| 4 ✅ **corrigido** (migration `0006_exercise_fk_cascade`: `ON DELETE CASCADE` em `set_entries`, `routine_exercises` e `set_targets`) | `05-portal-e-exclusao` › "quando o usuário tem exercício personalizado já usado em séries, então a conta é apagada por inteiro"<br>`01-cadastro` › "quando o usuário tem exercício personalizado já usado em séries, então user.deleted apaga tudo" | **Bug novo, não estava no plano.** `exercises.owner_user_id` cascateia de `users`, mas `set_entries.exercise_id` (e `routine_exercises.exercise_id`) referenciam `exercises` sem cascade. Apagar um usuário com exercício personalizado já usado numa série falha com `23503 foreign key violation`. Efeito: a exclusão de conta devolve erro 500 e o webhook `user.deleted` da Clerk falha (e fica em retry). Um usuário que usa o bot e cria um exercício próprio **não consegue apagar a conta**. | `db/schema.ts` (FKs de `set_entries` e `routine_exercises`) |
| 5 ✅ **corrigido** | `14-idempotencia-pagamentos` › "quando a mesma disputa chega 2 vezes ao mesmo tempo, então cancela 1 vez e alerta 1 vez" | _Corrigido: o webhook grava o `event.id` em `stripe_events` antes de tudo (reentrega = 200 sem efeito), o trabalho roda na task `stripe-event` e o cancelamento usa idempotency key derivada do evento._ Antes: o webhook do Stripe não guardava os eventos já processados. Uma disputa reentregue disparava o alerta no Sentry de novo, e duas entregas simultâneas chamavam `subscriptions.cancel` duas vezes (a segunda falhava com 500). | `app/api/webhooks/stripe/route.ts`, `lib/subscription-sync.ts` |
| 6 ✅ **corrigido** | `14-idempotencia-pagamentos` › "quando o reembolso diz 'total' no corpo mas o Stripe diz que é parcial, então vale o Stripe" | _Corrigido: a task relê a cobrança com `charges.retrieve`._ Antes: `charge.refunded` decidia pelo `refunded` do corpo do evento, um retrato do momento do envio. | `trigger/stripe-events.ts` |
| 7 ✅ **corrigido** | `14-idempotencia-pagamentos` › "quando a mesma chave chega 2 vezes ao mesmo tempo, então ... o Checkout é aberto 1 vez" | _Corrigido: `startCheckoutAction` aceita um Idempotency-Key (UUID v4) do cliente e reserva a chave antes de rodar (`lib/idempotency.ts`)._ Antes: a proteção dependia só da chave do Stripe por minuto; requisições repetidas refaziam todo o fluxo. | `app/(app)/actions.ts` |

## Observações

- Os demais testes de exclusão (`deleteAccountAction`, `clerk-user-deleted`) usam exercícios do catálogo global para não ficarem mascarados pelo bug #4. O caso do exercício personalizado tem teste próprio.
- Rodar: `npm run test:integration` (só integração) ou `npm run test:all` (unitários + integração).

## Comportamentos suspeitos (refatoração em camadas — NÃO corrigir durante a refatoração)

Registrados pelos testes de caracterização `tests/integration/15-bot-fluxos.test.ts`, que passam hoje: eles fixam o comportamento atual para a refatoração não mudá-lo sem querer. Corrigir é uma decisão à parte, depois da refatoração.

| # | Situação | Comportamento atual | Confirmado por |
|---|----------|---------------------|----------------|
| S1 | Passo "dias da semana" do onboarding | Qualquer texto sem `/` é consumido pelo passo, inclusive uma série ("supino 10x20"): responde "não entendi os dias" e o passo continua. Já o passo de duração deixa passar textos com mais de 10 caracteres. As duas regras são diferentes. | teste: "quando os dias não são entendidos…" |
| S2 | Botão "Cancelar" num passo de duração | Responde "Essa ação não está mais disponível" e apaga o passo (o botão nem existe no teclado de duração; só chega por callback antigo). | teste: "…toca em 'Cancelar' num passo de duração…" |
| S3 | `handleUpdate`: `if (!text) return { status: "ignored" }` (após transcrição) | Sai sem chamar `finish()`, deixando a linha de `messages` em `received`. Provavelmente inalcançável. | só leitura do código |
| S4 | Sinal de queda de volume | `muscleGroupReportText` usa `-` (hífen); `periodReportText` usa `−` (sinal de menos). | só leitura do código |
| S5 | `messagesThisMonth` | Soma de `date >= 1º do mês` sem limite superior; `admitMessage` tem o limite. | só leitura do código |
| S6 | Teste `14-idempotencia-pagamentos` › "antecessor ainda vivo falha depois da tomada…" | Falhou 1 vez na suíte completa (`expected X not to be X`) e passou ao rodar o arquivo sozinho: intermitente. | baseline da refatoração |
