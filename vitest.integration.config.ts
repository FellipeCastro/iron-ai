import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { loadTestEnv } from "./tests/integration/env";

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Testes de integração: banco real (branch de teste do Neon), serviços externos simulados.
// Variáveis vêm só do `.env.test`; o `.env` nunca é lido.
export default defineConfig({
  resolve: {
    alias: {
      "@": root("."),
      // `server-only` lança fora do bundler do Next.
      "server-only": root("tests/integration/helpers/empty.ts"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    env: { ...loadTestEnv(), NODE_ENV: "test" },
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    // Todos os arquivos compartilham o mesmo banco: nada de paralelismo entre arquivos.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
