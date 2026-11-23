import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Sem `server-only` de propósito: o worker do Trigger.dev e os scripts `tsx` rodam fora do Next.js,
// onde `server-only` lança. Código web importa `@/db` (db/index.ts), que tem a trava.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// DATABASE_URL é o owner hoje: ignora o RLS e nada define `app.user_id`. Cada consulta precisa filtrar por usuário.
// HTTP driver: one round-trip per query, no pooling needed on serverless.
// No interactive transactions — use `db.batch([...])` for atomic multi-statement writes.
export const db = drizzle({ client: neon(process.env.DATABASE_URL), schema });

export * from "./schema";
