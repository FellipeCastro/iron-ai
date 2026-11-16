# Bugs encontrados pelos testes de integração

Testes que falham por bug real ficam falhando (não são apagados, pulados nem afrouxados) e são listados aqui.
Todos os bugs abaixo foram **confirmados por execução** contra o banco de teste.

| # | Teste que falha | Bug | Onde |
|---|-----------------|-----|------|
| 1 ✅ **corrigido** | `01-cadastro` › "quando user.deleted roda, então o cliente Stripe dele é cancelado" | _Corrigido: a tarefa agora apaga o cliente no Stripe antes de apagar o usuário (falha do Stripe → erro e retry, com o usuário preservado; cliente já inexistente é tolerado)._ Antes: a tarefa `clerk-user-deleted` só apaga o usuário no banco. Nunca chama o Stripe: o cliente e a assinatura continuam sendo cobrados. | `trigger/clerk-users.ts` |
| 2 ✅ **corrigido** | `02-acesso` › "quando a assinatura está active mas current_period_end já passou, então o acesso é totalmente removido" | _Corrigido: `hasAccess` agora também exige `current_period_end` no futuro para `active` e `trialing` (`past_due` fica de fora, pois o período já venceu enquanto o Stripe tenta o cartão)._ Antes: `hasAccess` só olhava o `status`. Assinatura `active` com período vencido ainda dá acesso. | `lib/services/access.ts` |
| 3 ✅ **corrigido** | `03-checkout` › "quando o usuário clica 2 vezes ao mesmo tempo, então só 1 Checkout Session é criada" | _Corrigido: a sessão agora usa `idempotencyKey` por usuário, plano e minuto._ Antes: `checkout.sessions.create` era chamado sem `idempotencyKey` (o cliente Stripe tem, a sessão não): cada clique cria uma sessão. | `lib/services/billing.ts` (`createCheckoutUrl`) |
| 4 ✅ **corrigido** (migration `0006_exercise_fk_cascade`: `ON DELETE CASCADE` em `set_entries`, `routine_exercises` e `set_targets`) | `05-portal-e-exclusao` › "quando o usuário tem exercício personalizado já usado em séries, então a conta é apagada por inteiro"<br>`01-cadastro` › "quando o usuário tem exercício personalizado já usado em séries, então user.deleted apaga tudo" | **Bug novo, não estava no plano.** `exercises.owner_user_id` cascateia de `users`, mas `set_entries.exercise_id` (e `routine_exercises.exercise_id`) referenciam `exercises` sem cascade. Apagar um usuário com exercício personalizado já usado numa série falha com `23503 foreign key violation`. Efeito: a exclusão de conta devolve erro 500 e o webhook `user.deleted` da Clerk falha (e fica em retry). Um usuário que usa o bot e cria um exercício próprio **não consegue apagar a conta**. | `db/schema.ts` (FKs de `set_entries` e `routine_exercises`) |

## Observações

- Os demais testes de exclusão (`deleteAccountAction`, `clerk-user-deleted`) usam exercícios do catálogo global para não ficarem mascarados pelo bug #4. O caso do exercício personalizado tem teste próprio.
- Rodar: `npm run test:integration` (só integração) ou `npm run test:all` (unitários + integração).
