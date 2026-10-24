import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// HTTP driver: one round-trip per query, no pooling needed on serverless.
// No interactive transactions — use `db.batch([...])` for atomic multi-statement writes.
export const db = drizzle({ client: neon(process.env.DATABASE_URL), schema });

export * from "./schema";
