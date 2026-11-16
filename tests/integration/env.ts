import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Ambiente dos testes de integração. Lê SOMENTE `.env.test`: o `.env` (que pode apontar para produção)
// nunca é carregado por aqui.

const ENV_FILE = resolve(process.cwd(), ".env.test");

export function loadTestEnv(): Record<string, string> {
  if (!existsSync(ENV_FILE)) {
    throw new Error("`.env.test` não encontrado. Crie-o com DATABASE_URL e TEST_DB_HOST da branch de teste do Neon.");
  }
  const env: Record<string, string> = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return env;
}

/**
 * Trava de segurança: a suíte faz TRUNCATE no banco. Só segue se o host de DATABASE_URL for exatamente
 * o host declarado em TEST_DB_HOST.
 */
export function assertTestDatabase(url: string | undefined, expectedHost: string | undefined) {
  if (!url) throw new Error("[testes] DATABASE_URL ausente em .env.test. Abortando.");
  if (!expectedHost) throw new Error("[testes] TEST_DB_HOST ausente em .env.test. Abortando para proteger o banco.");
  const host = new URL(url).hostname;
  if (host !== expectedHost) {
    throw new Error(`[testes] O host de DATABASE_URL (${host}) não é o TEST_DB_HOST (${expectedHost}). Abortando: a suíte apagaria esse banco.`);
  }
}
