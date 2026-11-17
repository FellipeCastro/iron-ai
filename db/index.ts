import "server-only";

// Entrada do banco para o código web (Next.js): importar daqui em um componente cliente falha no build.
// Worker do Trigger.dev, scripts e serviços compartilhados com eles usam `@/db/client` (sem a trava).
export * from "./client";
