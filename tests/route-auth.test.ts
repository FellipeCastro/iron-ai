import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// O proxy.ts não protege rota nenhuma: cada página/rota precisa se proteger sozinha.
// Este teste falha se surgir um page.tsx/route.ts novo sem proteção e fora da lista pública.

const ROOT = join(process.cwd(), "app");

/** Rotas públicas por design (caminho relativo a app/, com "/"). Cada uma diz o que a protege. */
const PUBLIC: Record<string, string> = {
  "page.tsx": "landing page",
  "(legal)/privacidade/page.tsx": "texto legal",
  "(legal)/termos/page.tsx": "texto legal",
  "(auth)/sign-in/[[...sign-in]]/page.tsx": "tela de login do Clerk",
  "(auth)/sign-up/[[...sign-up]]/page.tsx": "tela de cadastro do Clerk",
  "api/webhooks/clerk/route.ts": "assinatura verificada (verifyWebhook)",
  "api/webhooks/stripe/route.ts": "assinatura verificada (constructEvent)",
  "api/telegram/webhook/route.ts": "secret token do Telegram",
};

const AUTH_CALL = /auth\.protect\(|await auth\(\)|redirectToSignIn/;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /^(page\.tsx|route\.ts)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

const files = walk(ROOT).map((f) => ({ rel: relative(ROOT, f).split(sep).join("/"), src: readFileSync(f, "utf8") }));

describe("proteção de rotas", () => {
  it("encontra as rotas do app", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.filter((f) => !(f.rel in PUBLIC)))("$rel exige autenticação", ({ src }) => {
    expect(src).toMatch(AUTH_CALL);
  });

  it("a lista pública não tem entradas obsoletas", () => {
    const existing = new Set(files.map((f) => f.rel));
    expect(Object.keys(PUBLIC).filter((p) => !existing.has(p))).toEqual([]);
  });

  it("webhooks públicos mantêm sua verificação", () => {
    const check: Record<string, RegExp> = {
      "api/webhooks/clerk/route.ts": /verifyWebhook\(/,
      "api/webhooks/stripe/route.ts": /constructEvent\(/,
      "api/telegram/webhook/route.ts": /x-telegram-bot-api-secret-token/,
    };
    for (const [rel, re] of Object.entries(check)) {
      expect(files.find((f) => f.rel === rel)?.src, rel).toMatch(re);
    }
  });
});
