import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertTestDatabase } from "./integration/env";

const TEST_HOST = "ep-test.neon.tech";
const DEV_HOST = "ep-dev.neon.tech";
const url = (host: string) => `postgresql://u:p@${host}/neondb?sslmode=require`;

describe("assertTestDatabase", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "guard-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("aceita o host de teste quando não coincide com o do .env", () => {
    writeFileSync(join(dir, ".env"), `DATABASE_URL=${url(DEV_HOST)}\n`);
    expect(() => assertTestDatabase(url(TEST_HOST), TEST_HOST, dir)).not.toThrow();
  });

  it("aceita quando não existe .env", () => {
    expect(() => assertTestDatabase(url(TEST_HOST), TEST_HOST, dir)).not.toThrow();
  });

  it("recusa quando o host de teste é o mesmo do .env", () => {
    writeFileSync(join(dir, ".env"), `DATABASE_URL="${url(TEST_HOST)}"\n`);
    expect(() => assertTestDatabase(url(TEST_HOST), TEST_HOST, dir)).toThrow(/dev\/produção/);
  });

  it("recusa também quando o host coincide com uma linha comentada do .env", () => {
    writeFileSync(join(dir, ".env"), `# DATABASE_URL=${url(TEST_HOST)}\nDATABASE_URL=${url(DEV_HOST)}\n`);
    expect(() => assertTestDatabase(url(TEST_HOST), TEST_HOST, dir)).toThrow(/dev\/produção/);
  });

  // N-6: o .env.production real é uma linha única, com a URL no meio de um comentário.
  it("recusa quando a URL está no meio de uma linha (ex.: tudo colado em um comentário)", () => {
    writeFileSync(join(dir, ".env.production"), `# production # NEXT_PUBLIC_X=abc CLERK_SECRET_KEY=def DATABASE_URL=${url(TEST_HOST)} STRIPE_SECRET_KEY=ghi\n`);
    expect(() => assertTestDatabase(url(TEST_HOST), TEST_HOST, dir)).toThrow(/dev\/produção/);
  });

  it("recusa URL de outra variável (ex.: DATABASE_URL_OWNER) e entre aspas", () => {
    writeFileSync(join(dir, ".env.local"), `DATABASE_URL_OWNER="${url(TEST_HOST)}"\n`);
    expect(() => assertTestDatabase(url(TEST_HOST), TEST_HOST, dir)).toThrow(/dev\/produção/);
  });

  it("não confunde um host parecido com o de teste", () => {
    writeFileSync(join(dir, ".env"), `DATABASE_URL=${url("ep-test.neon.tech.outro.com")}\n`);
    expect(() => assertTestDatabase(url(TEST_HOST), TEST_HOST, dir)).not.toThrow();
  });

  it("recusa host de teste direto quando o .env usa o endpoint pooled do mesmo banco", () => {
    writeFileSync(join(dir, ".env"), `DATABASE_URL=${url("ep-test-pooler.neon.tech")}\n`);
    expect(() => assertTestDatabase(url(TEST_HOST), TEST_HOST, dir)).toThrow(/dev\/produção/);
  });

  it("recusa host de teste pooled quando o .env usa o endpoint direto do mesmo banco", () => {
    const pooled = "ep-test-pooler.neon.tech";
    writeFileSync(join(dir, ".env"), `DATABASE_URL=${url(TEST_HOST)}\n`);
    expect(() => assertTestDatabase(url(pooled), pooled, dir)).toThrow(/dev\/produção/);
  });

  it("aceita um endpoint Neon distinto mesmo com pooler no .env", () => {
    writeFileSync(join(dir, ".env"), `DATABASE_URL=${url("ep-dev-pooler.neon.tech")}\n`);
    expect(() => assertTestDatabase(url(TEST_HOST), TEST_HOST, dir)).not.toThrow();
  });

  it("recusa quando DATABASE_URL difere de TEST_DB_HOST", () => {
    expect(() => assertTestDatabase(url(DEV_HOST), TEST_HOST, dir)).toThrow(/não é o TEST_DB_HOST/);
  });
});
