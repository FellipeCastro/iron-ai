import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

// Ambiente dos testes de integração. Lê SOMENTE `.env.test`: o `.env` (que pode apontar para produção)
// nunca é carregado por aqui.

const ENV_FILE = resolve(process.cwd(), ".env.test");

export function loadTestEnv(): Record<string, string> {
  if (!existsSync(ENV_FILE)) {
    throw new Error("`.env.test` não encontrado. Crie-o com DATABASE_URL e TEST_DB_HOST da branch de teste do Neon.");
  }
  // parseEnv trata comentários no fim da linha e preserva `#` dentro de valores entre aspas.
  return parseEnv(readFileSync(ENV_FILE, "utf8")) as Record<string, string>;
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
