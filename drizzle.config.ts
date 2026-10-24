import "./db/env";
import { defineConfig } from "drizzle-kit";

// `generate` works offline; `migrate`, `push` and `studio` need DATABASE_URL in .env.
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
