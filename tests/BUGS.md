# Bugs encontrados pelos testes de integração

Testes que falham por bug real ficam falhando (não são apagados, pulados nem afrouxados) e são listados aqui.

| # | Teste | Bug | Onde |
|---|-------|-----|------|
| 1 | Clerk `user.deleted` cancela o cliente no Stripe | A tarefa só apaga o usuário; não cancela cliente/assinatura no Stripe | `trigger/clerk-users.ts` |
| 2 | Assinatura `active` com `current_period_end` vencido remove o acesso | `hasAccess` só olha o status | `lib/services/access.ts` |
| 3 | Clique duplo em "assinar" cria 1 só Checkout Session | `checkout.sessions.create` sem idempotency key | `lib/services/billing.ts` |

_Status: esperados, ainda não confirmados por execução (os testes dos fluxos 1–8 ainda não foram escritos)._
