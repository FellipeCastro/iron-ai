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

// Arquivos de ambiente de desenvolvimento/produção cujo banco a suíte NUNCA pode tocar.
const DEV_ENV_FILES = [".env", ".env.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local"];

/**
 * Hosts de qualquer connection string `postgres(ql)://` (inclusive comentadas, de qualquer variável e em qualquer
 * posição da linha) nos arquivos de ambiente que não são de teste. Não depende do nome da variável nem de a URL
 * começar a linha: o `.env.production` real é uma linha única com tudo dentro de um comentário.
 */
function devDatabaseHosts(baseDir: string): Set<string> {
  const hosts = new Set<string>();
  for (const name of DEV_ENV_FILES) {
    const file = resolve(baseDir, name);
    if (!existsSync(file)) continue;
    const content = readFileSync(file, "utf8");
    // Linhas comentadas também contam: reativar uma delas não pode abrir caminho para o TRUNCATE.
    for (const match of content.matchAll(/postgres(?:ql)?:\/\/[^\s"']+/g)) {
      try {
        hosts.add(new URL(match[0]).hostname);
      } catch {
        // valor que não é URL (placeholder): ignora
      }
    }
  }
  return hosts;
}

/**
 * No Neon, o endpoint pooled (`ep-xxx-pooler.região.neon.tech`) e o direto (`ep-xxx.região.neon.tech`) apontam
 * para o mesmo banco. Remove o sufixo `-pooler` do primeiro rótulo para compará-los como o mesmo endpoint.
 */
function normalizeNeonHost(host: string): string {
  const lower = host.toLowerCase();
  if (!lower.endsWith(".neon.tech")) return lower;
  return lower.replace(/^(ep-[^.]+?)-pooler(?=\.)/, "$1");
}

/**
 * Trava de segurança: a suíte faz TRUNCATE no banco. Só segue se o host de DATABASE_URL for exatamente
 * o host declarado em TEST_DB_HOST **e** não for o host de nenhum banco de dev/produção (`.env` etc.).
 */
export function assertTestDatabase(url: string | undefined, expectedHost: string | undefined, baseDir = process.cwd()) {
  if (!url) throw new Error("[testes] DATABASE_URL ausente em .env.test. Abortando.");
  if (!expectedHost) throw new Error("[testes] TEST_DB_HOST ausente em .env.test. Abortando para proteger o banco.");
  const host = new URL(url).hostname;
  if (host !== expectedHost) {
    throw new Error(`[testes] O host de DATABASE_URL (${host}) não é o TEST_DB_HOST (${expectedHost}). Abortando: a suíte apagaria esse banco.`);
  }
  const normalizedHost = normalizeNeonHost(host);
  if ([...devDatabaseHosts(baseDir)].some((devHost) => normalizeNeonHost(devHost) === normalizedHost)) {
    throw new Error(`[testes] O host de teste (${host}) é o mesmo de um banco de dev/produção em .env*. Abortando: a suíte apagaria esse banco.`);
  }
}
