import "./db/env";
import { defineConfig } from "drizzle-kit";

// `generate` works offline; `migrate`, `push` and `studio` need a connection in .env.
// Migrations/DDL run as the owner role (DATABASE_URL_OWNER, falling back to DATABASE_URL).
// Today the app also connects as the owner (DATABASE_URL), which bypasses RLS: the `app_runtime` role
// and its policies (drizzle/0008, 0009) exist, but no code sets `app.user_id`, so they are not enforced.
// Switching the app to `app_runtime` needs a per-request transaction (neon-http has none) plus a separate
// service connection for server-only tables; see tests/integration/10-app-runtime-role.test.ts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: (process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL)! },
  strict: true,
  verbose: true,
});
