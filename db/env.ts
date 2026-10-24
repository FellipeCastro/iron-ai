import { loadEnvConfig } from "@next/env";

// Loads .env / .env.local the same way Next does, for tools that run outside Next (drizzle-kit, scripts).
loadEnvConfig(process.cwd());
