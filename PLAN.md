# Testes de integração (estilo request spec) — iron-ai

## Contexto
O app (Next 16 + Clerk + Stripe + Neon/Drizzle + Trigger.dev + bot do Telegram) só tem testes unitários do motor (`tests/engine`, `tests/ai`). Nenhuma rota, server action ou webhook é testada com banco real. Objetivo: cobrir os fluxos que mexem com dinheiro, permissão e dado de outro usuário. Você é a fonte da verdade: **as frases abaixo precisam da sua confirmação antes de eu escrever qualquer teste.**

## Fluxos críticos encontrados
1. Cadastro / sincronização de usuário (webhook Clerk → Trigger, `ensureUser`)
2. Login / acesso (`currentAppUser`, gate de assinatura nas páginas, actions e bot)
3. Checkout (`startCheckoutAction`, `createCheckoutUrl`, `/assinar/sucesso`)
4. Webhook Stripe (`/api/webhooks/stripe`, `syncSubscription`, disputa, reembolso)
5. Portal de cobrança e exclusão de conta
6. Dados de treino na web (actions de série, sessão, rotina, exercício): isolamento entre usuários
7. Vínculo do Telegram (token de link) e webhook do Telegram (segredo, limites, duplicidade)
8. Registro de séries pelo bot (`handleUpdate` / `logSets`) e limites de custo (mensagens/dia, mês, orçamento OpenAI)

Fora do escopo (sem dinheiro/permissão): relatórios, lembretes, gráficos, SEO, landing.

## Frases de comportamento
Marcadores: ✅ = comportamento que o código já tem hoje; ❓ = **não sei se é o esperado, preciso da sua decisão**.

### 1. Cadastro
describe("POST /api/webhooks/clerk")
- it("quando a assinatura svix é inválida, então responde 400 e não enfileira nada")
- it("quando chega user.created válido, então enfileira 1 tarefa com a chave de idempotência do svix-id e responde 200")
- it("quando o mesmo svix-id chega duas vezes, então a segunda entrega usa a mesma idempotencyKey")
- it("quando o evento não traz id de usuário, então responde 200 sem enfileirar")
describe("tarefas clerk-user-created/updated/deleted (rodam no banco real)")
- it("quando user.created roda duas vezes para o mesmo clerkId, então existe 1 só usuário")
- it("quando user.updated chega antes de user.created, então o usuário é criado (backfill)")
- it("quando user.deleted roda, então apaga o usuário e tudo que depende dele (assinatura, treinos, vínculo Telegram)")
- it("quando user.deleted roda, então o cliente Stripe dele é cancelado") ✔ CONFIRMADO. Hoje o código NÃO faz isso: este teste vai falhar e entrar em BUGS.md.
describe("ensureUser")
- it("quando o webhook ainda não chegou, então cria o usuário na hora")
- it("quando 2 requisições simultâneas pedem o mesmo clerkId novo, então só 1 usuário é criado e ambas recebem o mesmo id")

### 2. Login / acesso
describe("actions protegidas por assinatura (saveRoutine, updateSet, deleteSet, addSet, deleteSession, updateDuration, deleteExerciseFromSession)")
- it("quando não há sessão Clerk, então a action é rejeitada (auth.protect)")
- it("quando o usuário não tem assinatura nem é complimentary, então retorna ok:false com 'Sua assinatura não está ativa' e nada é gravado")
- it("quando o status é active ou trialing, então a action executa")
- it("quando o status é past_due, então a action executa") ✅ (acesso mantido enquanto o Stripe tenta o cartão) — confirme
- it("quando o status é canceled, unpaid, incomplete ou incomplete_expired, então é bloqueado")
- it("quando a conta é complimentary sem assinatura, então tem acesso")
- it("quando a assinatura está active mas current_period_end já passou, então o acesso é totalmente removido") ✔ CONFIRMADO (corrigido por você). Hoje `hasAccess` só olha o status, então este teste deve falhar e entrar em BUGS.md.
describe("actions liberadas sem assinatura (saveSettings, createTelegramLink, disconnectTelegram, startCheckout, openBillingPortal, deleteAccount)")
- it("quando o usuário está sem assinatura, então consegue usar essas actions") ✅ (para poder pagar ou sair)
describe("GET /assinar/sucesso")
- it("quando não há sessão, então redireciona para o login")

### 3. Checkout
describe("startCheckoutAction")
- it("quando o plano é monthly ou annual e o usuário não tem assinatura, então devolve a URL do Checkout com o price do plano, client_reference_id = id do usuário e o customer salvo")
- it("quando o plano é inválido (ex.: 'weekly', vazio), então retorna 'Plano inválido.' e não chama o Stripe")
- it("quando o Stripe falha, então retorna mensagem de erro amigável, não grava assinatura e não lança exceção")
- it("quando o usuário já tem acesso, então devolve a URL do dashboard e NÃO cria outro Checkout")
- it("quando o usuário pagou mas o webhook ainda não chegou (Stripe lista assinatura ativa), então sincroniza a assinatura e devolve o dashboard em vez de cobrar de novo")
- it("quando o usuário não tinha cliente Stripe, então cria 1 cliente e salva o id antes de abrir o Checkout")
- it("quando o usuário clica 2 vezes em 'assinar' ao mesmo tempo, então só existe 1 cliente Stripe e 1 stripeCustomerId") ✅ (chave de idempotência)
- it("quando o usuário clica 2 vezes ao mesmo tempo, então só 1 Checkout Session é criada") ✔ CONFIRMADO. Hoje cada clique cria uma sessão (sem idempotency key): provável falha, vai para BUGS.md.
describe("GET /assinar/sucesso?session_id=")
- it("quando o session_id é do cliente do próprio usuário, então sincroniza a assinatura e redireciona para o dashboard")
- it("quando o session_id pertence ao cliente de OUTRO usuário, então NÃO sincroniza nada e o acesso do usuário não muda")
- it("quando o session_id não começa com 'cs_' ou falta, então não chama o Stripe")
- it("quando o Stripe falha, então redireciona para /settings?checkout=success sem derrubar a rota")
- it("quando o webhook ainda não ativou a assinatura, então redireciona para /settings?checkout=success")

### 4. Webhook Stripe
describe("POST /api/webhooks/stripe")
- it("quando falta o header stripe-signature, então 400")
- it("quando a assinatura é forjada ou o corpo foi alterado, então 400 e o banco não muda")
- it("quando chega customer.subscription.created de um cliente conhecido, então grava status, price, current_period_end, trial_end e cancel_at_period_end")
- it("quando chega checkout.session.completed / invoice.paid / invoice.payment_failed, então sincroniza a assinatura referenciada")
- it("quando invoice.payment_failed deixa a assinatura past_due, então o usuário mantém acesso")
- it("quando customer.subscription.deleted chega, então o status vira canceled e o acesso é removido")
- it("quando cancel_at_period_end é true, então o acesso continua até o fim do período")
- it("quando o mesmo evento chega duas vezes, então o banco fica igual (1 linha) e responde 200")
- it("quando 2 entregas do mesmo evento chegam ao mesmo tempo, então continua 1 linha e nenhuma dá erro")
- it("quando chegam eventos fora de ordem, então vale o estado atual lido do Stripe, não a ordem de chegada")
- it("quando o evento é de um cliente sem usuário local, então responde 200, não grava nada") ✔ CONFIRMADO (200)
- it("quando o evento de uma assinatura ANTIGA chega depois de uma nova ativa, então a nova não é sobrescrita")
- it("quando uma assinatura antiga já terminou e o usuário assina de novo, então a nova substitui a antiga")
- it("quando o Stripe falha ao ler a assinatura, então 500 (para o Stripe reenviar)")
- it("quando chega charge.dispute.created, então cancela todas as assinaturas vivas do cliente e o acesso acaba na hora")
- it("quando chega charge.refunded TOTAL, então cancela as assinaturas; se for reembolso PARCIAL, então nada é cancelado")
- it("quando chega early_fraud_warning, então só alerta (nenhuma assinatura muda)")
- it("quando chega um tipo de evento desconhecido, então 200 sem efeito")

### 5. Portal e exclusão de conta
describe("openBillingPortalAction")
- it("quando o usuário está logado, então devolve a URL do portal com return_url em /settings")
- it("quando o Stripe falha, então retorna erro amigável")
describe("deleteAccountAction")
- it("quando tudo dá certo, então cancela o cliente no Stripe, apaga o usuário e todos os seus dados, e apaga o login na Clerk")
- it("quando o Stripe falha, então NADA é apagado e o usuário pode tentar de novo")
- it("quando a Clerk falha depois de apagar os dados, então retorna erro avisando que o login ficou")
- it("quando o usuário A apaga a conta, então os dados do usuário B continuam intactos")
- it("quando 2 exclusões simultâneas disparam, então nenhuma dá erro 500 e os dados somem uma vez só")

### 6. Dados de treino (web) — acesso indevido
describe("updateSetAction / deleteSetAction / addSetAction / deleteExerciseFromSessionAction / deleteSessionAction / updateSessionDurationAction")
- it("quando o usuário edita a própria série, então cria a correção (a antiga fica anulada) e os alvos são recalculados")
- it("quando o usuário A tenta editar, apagar ou adicionar série na sessão/série do usuário B, então recebe 'não encontrada' e nada muda no banco")
- it("quando A tenta apagar a sessão ou duração de B, então 'não encontrado' e nada muda")
- it("quando A tenta adicionar série usando exercício personalizado de B, então é recusado")
- it("quando o uuid é inválido, então retorna erro de validação sem tocar no banco")
- it("quando weight < 0 ou > 1000, ou reps < 1 ou > 100, então rejeita") — limites
- it("quando weight = 0, então aceita (peso corporal)") ✔ CONFIRMADO
- it("quando reps = 0 ou negativo, então rejeita")
- it("quando a duração é 0, negativa ou > 600 min, então rejeita")
- it("quando a duração é editada numa sessão ainda aberta, então 'não encontrado'")
- it("quando o mesmo 'apagar série' é enviado 2 vezes (duplo clique), então a segunda retorna 'não encontrada' e nada quebra")
- it("quando 2 'apagar exercício' simultâneos chegam, então a sessão é removida só se ficou sem séries e não dá erro")
- it("quando apago a última série, então a sessão some (sessionEmpty = true)")
describe("saveRoutineAction")
- it("quando a rotina é válida, então salva uma NOVA versão e as sessões antigas continuam apontando para a versão em que foram feitas")
- it("quando usa exercício personalizado de outro usuário, então 'Exercício inválido na rotina' e nada é salvo")
- it("quando há 0 dias, mais de 5 dias, mais de 20 exercícios por dia ou séries planejadas fora de 1–6, então rejeita")
- it("quando 2 salvamentos simultâneos chegam, então não existem 2 versões iguais (unique user+version) e nenhum perde dado silenciosamente")
- it("quando o exercício do catálogo global é renomeado, então o usuário ganha uma cópia própria e o catálogo global não muda para os outros")
describe("saveSettingsAction")
- it("quando o fuso, horário (HH:MM), dias (1–7) ou incremento (0.25–10) é inválido, então rejeita")
- it("quando a requisição é válida, então altera só o usuário logado")

### 7. Telegram: vínculo e webhook
describe("createTelegramLinkAction + /start <token>")
- it("quando o usuário gera o link, então só o hash do token vai ao banco e expira em 15 min")
- it("quando o token é usado, então vincula o chat ao usuário")
- it("quando o mesmo token é usado de novo, então 'link inválido'")
- it("quando o token está expirado ou não existe, então 'link inválido' e nada é vinculado")
- it("quando 2 chats usam o mesmo token ao mesmo tempo, então só 1 vincula")
- it("quando o chat já pertence a OUTRO usuário, então 'chat ocupado' e o vínculo do outro não muda") ✔ CONFIRMADO: o token é consumido e o usuário gera outro (comportamento atual, teste deve passar)
- it("quando o usuário vincula um novo chat, então o chat anterior é substituído (1 chat por conta)")
describe("POST /api/telegram/webhook")
- it("quando o segredo é errado, ausente ou não configurado, então 401 e nada é enfileirado")
- it("quando o corpo não é JSON, então 400")
- it("quando o chat não é privado ou o update não tem update_id, então 200 e ignora")
- it("quando o chat é de usuário vinculado, então enfileira com idempotencyKey por update_id e concurrencyKey por usuário")
- it("quando o mesmo update_id chega 2 vezes, então a chave de idempotência é a mesma")
- it("quando o usuário passa do limite diário (60), então 200, avisa 1 vez só e NÃO enfileira")
- it("quando passa do limite mensal, então avisa 1 vez só e NÃO enfileira")
- it("quando o usuário manda exatamente o 60º do dia, então é processado; o 61º é bloqueado") — limite
- it("quando 70 mensagens chegam ao mesmo tempo, então o contador termina em 70 e exatamente 60 são enfileiradas, com 1 só aviso")
- it("quando o usuário toca num botão (callback), então não conta para o limite")
- it("quando o chat não está vinculado, então não conta nem consome limite de ninguém")

### 8. Bot e limites de custo
describe("handleUpdate (Telegram e OpenAI simulados)")
- it("quando o usuário sem assinatura manda mensagem ou toca botão, então recebe 'assinatura necessária' e NENHUMA chamada ao OpenAI é feita")
- it("quando o usuário sem assinatura manda /start <token>, então o vínculo funciona")
- it("quando a mensagem 'supino 80x8 3 séries' chega, então grava 3 séries do usuário certo e recalcula alvos")
- it("quando o mesmo update_id é processado 2 vezes, então as séries são gravadas uma vez só")
- it("quando 2 updates diferentes do mesmo usuário rodam ao mesmo tempo sem sessão aberta, então existe no máximo 1 sessão aberta") ✔ CONFIRMADO (uma única sessão; sem erro para o usuário)
- it("quando o orçamento diário global ou do usuário do OpenAI estoura, então não há chamada ao modelo e o usuário recebe aviso")
- it("quando o usuário A está vinculado ao chat X, então nenhuma gravação cai na conta do usuário B")
- it("quando a sessão está parada há 90 min e chega uma série nova, então a antiga fecha e abre outra")
- it("quando se fecha a mesma sessão duas vezes ao mesmo tempo, então só uma gera resumo")
- it("quando uma sessão fecha sem séries válidas, então é removida")

## Setup (decidido por você)
- **Vitest** (já existe; `npm test` = `vitest run`). Sem trocar de ferramenta.
- **Banco:** branch de teste dedicada no Neon. Você disse que o `DATABASE_URL` do `.env` já é essa branch. Mantém o driver `neon-http`, então `db.batch` e `for("update")` rodam de verdade.
- **Proteção contra produção:** crio `.env.test` (no `.gitignore`) com `DATABASE_URL` copiado do `.env` e `TEST_DB_HOST` com o host da branch. O `globalSetup` **aborta** se o host da URL não for igual a `TEST_DB_HOST`, e os testes nunca leem `.env` diretamente. Assim, trocar o `.env` para produção por engano não faz os testes apagarem produção.
- **Atenção:** a suíte faz `TRUNCATE … CASCADE` nas tabelas dessa branch antes de cada teste. Qualquer dado nela será apagado.
- Migrations aplicadas com `drizzle-kit migrate` no `globalSetup`; arquivos rodam em série (`fileParallelism: false`).
- **Só simulado:** Clerk (`auth`, `clerkClient`), Stripe SDK, Trigger.dev `tasks.trigger`, Telegram client, OpenAI, Sentry, `next/headers`, `next/cache`, `server-only`. Banco, regras e a lógica de acesso rodam de verdade. O webhook do Stripe é assinado de verdade com `stripe.webhooks.generateTestHeaderString`.
- **Concorrência:** `Promise.all` contra o banco real.
- Estrutura: `tests/integration/*.test.ts`, `tests/integration/helpers/` (usuários, assinaturas, mocks), `vitest.integration.config.ts`, `tests/BUGS.md`.
- **Comando único:** `npm run test:all` = testes unitários + integração (o `globalSetup` migra e valida o banco).
- **E2E Playwright:** fora de escopo por enquanto (você decidiu).

## Regras de execução
- Teste que falha por bug real fica falhando e vai para `tests/BUGS.md`. Não apago, não pulo, não afrouxo.
- Se um teste parecer errado, eu paro e pergunto.

## Falhas esperadas (bugs reais; ficam falhando e entram em `tests/BUGS.md`)
1. Clerk `user.deleted` não cancela o cliente/assinatura no Stripe.
2. `hasAccess` ignora `current_period_end`: assinatura `active` com período vencido ainda dá acesso.
3. Sem idempotency key na criação da Checkout Session: clique duplo cria 2 sessões.

## Passos de execução (após aprovação)
1. Criar `.env.test`, `vitest.integration.config.ts`, `globalSetup`, helpers e mocks.
2. Escrever os testes por fluxo (1 a 8), batendo nas rotas e actions de verdade.
3. Rodar tudo, relatar passa/falha, registrar bugs em `tests/BUGS.md`.
4. Informar o comando único (`npm run test:all`).
