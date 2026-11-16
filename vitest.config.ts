import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // Integração tem config própria (banco real): `npm run test:integration`.
  test: { include: ["tests/**/*.test.ts"], exclude: ["tests/integration/**", "**/node_modules/**"] },
});
