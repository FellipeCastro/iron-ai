import "./db/env";
import { defineConfig } from "drizzle-kit";

// `generate` works offline; `migrate`, `push` and `studio` need a connection in .env.
// Migrations/DDL run as the owner role (DATABASE_URL_OWNER). The app itself should connect as the
// restricted `app_runtime` role (DATABASE_URL, see drizzle/0008_app_runtime_role.sql). Until the app
// is switched over, DATABASE_URL is still the owner and is used as the fallback.
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: (process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL)! },
  strict: true,
  verbose: true,
});
