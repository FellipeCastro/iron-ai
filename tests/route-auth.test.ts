import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// O proxy.ts não protege rota nenhuma: cada página/rota precisa se proteger sozinha.
// Aqui a proteção é verificada pelo COMPORTAMENTO: cada entrypoint é executado com o Clerk simulado.
// Sem sessão, a chamada precisa ser barrada ANTES de tocar em dados; com sessão, precisa seguir adiante.
// Comentários ou um `auth()` cujo resultado é ignorado não passam neste teste.

const h = vi.hoisted(() => {
  const state = { userId: null as string | null };
  const UNAUTHENTICATED = "UNAUTHENTICATED";
  const REDIRECT_SIGN_IN = "REDIRECT_SIGN_IN";
  const REACHED_DATA = "REACHED_DATA";
  const reachedData = vi.fn(() => {
    throw new Error(REACHED_DATA);
  });
  return {
    state,
    UNAUTHENTICATED,
    REDIRECT_SIGN_IN,
    REACHED_DATA,
    reachedData,
    ensureUser: vi.fn(async (id: string) => ({ id, stripeCustomerId: "cus_1" })),
    userHasAccess: vi.fn(async () => false),
    syncSubscription: vi.fn(async () => undefined),
    redirectToSignIn: vi.fn(() => {
      throw new Error(REDIRECT_SIGN_IN);
    }),
  };
});

vi.mock("@clerk/nextjs/server", () => {
  const auth = Object.assign(
    async () => ({ userId: h.state.userId, redirectToSignIn: h.redirectToSignIn }),
    {
      protect: async () => {
        if (!h.state.userId) throw new Error(h.UNAUTHENTICATED);
        return { userId: h.state.userId };
      },
    },
  );
  return { auth, currentUser: async () => (h.state.userId ? { firstName: "Teste" } : null) };
});
vi.mock("server-only", () => ({}));
// Server actions importados pelos componentes puxam o banco; nenhum teste aqui precisa dele.
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/db", () => ({}));
vi.mock("@clerk/nextjs", () => ({ UserButton: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
// Toda leitura de dados cai aqui: se for alcançada, a página passou pelo portão de autenticação.
vi.mock("@/lib/data", () => ({
  getCatalog: h.reachedData,
  getDashboard: h.reachedData,
  getExerciseDetail: h.reachedData,
  getExerciseSummaries: h.reachedData,
  getHistory: h.reachedData,
  getRoutine: h.reachedData,
  getSession: h.reachedData,
  getSettings: h.reachedData,
}));
vi.mock("@/lib/services/users", () => ({ ensureUser: h.ensureUser }));
vi.mock("@/lib/services/access", () => ({ userHasAccess: h.userHasAccess }));
vi.mock("@/lib/services/billing", () => ({ syncSubscription: h.syncSubscription }));
vi.mock("@/lib/stripe", () => ({ stripe: () => ({ checkout: { sessions: { retrieve: vi.fn() } } }) }));
vi.mock("@/lib/env", () => ({ siteUrl: () => "http://localhost:3000" }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

type Invoke = () => Promise<unknown>;
type Entry = {
  /** Executa o entrypoint; deve rejeitar ou retornar normalmente conforme o caso. */
  run: Invoke;
  /** Quando autenticado, o que prova que passou do portão. */
  authed: "reaches-data" | "resolves";
  /** Quando anônimo, qual erro barra a chamada. */
  denied: string;
};

const params = <T,>(v: T) => Promise.resolve(v);

const page =
  (path: string, args: () => unknown[] = () => []): Invoke =>
  async () => {
    const mod = await import(/* @vite-ignore */ `@/app/${path}`);
    return mod.default(...args());
  };

const ENTRIES: Record<string, Entry> = {
  "(app)/dashboard/page.tsx": { run: page("(app)/dashboard/page"), authed: "reaches-data", denied: h.UNAUTHENTICATED },
  "(app)/exercises/page.tsx": { run: page("(app)/exercises/page"), authed: "reaches-data", denied: h.UNAUTHENTICATED },
  "(app)/exercises/[id]/page.tsx": {
    run: page("(app)/exercises/[id]/page", () => [{ params: params({ id: "x" }) }]),
    authed: "reaches-data",
    denied: h.UNAUTHENTICATED,
  },
  "(app)/history/page.tsx": { run: page("(app)/history/page"), authed: "reaches-data", denied: h.UNAUTHENTICATED },
  "(app)/history/[id]/page.tsx": {
    run: page("(app)/history/[id]/page", () => [{ params: params({ id: "x" }) }]),
    authed: "reaches-data",
    denied: h.UNAUTHENTICATED,
  },
  "(app)/routine/page.tsx": { run: page("(app)/routine/page"), authed: "reaches-data", denied: h.UNAUTHENTICATED },
  "(app)/settings/page.tsx": {
    run: page("(app)/settings/page", () => [{ searchParams: params({}) }]),
    authed: "reaches-data",
    denied: h.UNAUTHENTICATED,
  },
  // A página é síncrona; o portão está no componente assíncrono interno (Plans), achado na árvore de elementos.
  "assinar/page.tsx": {
    run: async () => {
      const mod = await import("@/app/assinar/page");
      const tree = mod.default({ searchParams: params({}) });
      const plans = findComponent(tree, "Plans");
      if (!plans) throw new Error("componente Plans não encontrado em assinar/page.tsx");
      return plans.type(plans.props);
    },
    authed: "resolves",
    denied: h.REDIRECT_SIGN_IN,
  },
  "assinar/sucesso/route.ts": {
    run: async () => {
      const mod = await import("@/app/assinar/sucesso/route");
      return mod.GET({ nextUrl: new URL("http://localhost:3000/assinar/sucesso") } as never);
    },
    authed: "resolves",
    denied: h.REDIRECT_SIGN_IN,
  },
};

function findComponent(node: unknown, name: string): { type: (p: unknown) => unknown; props: unknown } | null {
  if (!node || typeof node !== "object") return null;
  const el = node as { type?: unknown; props?: { children?: unknown } };
  if (typeof el.type === "function" && el.type.name === name) return el as never;
  const children = el.props?.children;
  for (const c of Array.isArray(children) ? children : [children]) {
    const found = findComponent(c, name);
    if (found) return found;
  }
  return null;
}

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

const ROOT = join(process.cwd(), "app");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /^(page\.tsx|route\.ts)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

const files = walk(ROOT).map((f) => ({ rel: relative(ROOT, f).split(sep).join("/"), src: readFileSync(f, "utf8") }));
const protectedFiles = files.filter((f) => !(f.rel in PUBLIC)).map((f) => f.rel);

describe("proteção de rotas", () => {
  beforeEach(() => {
    h.state.userId = null;
    vi.clearAllMocks();
  });

  it("encontra as rotas do app", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("toda rota fora da lista pública tem teste comportamental (e vice-versa)", () => {
    expect([...protectedFiles].sort()).toEqual(Object.keys(ENTRIES).sort());
  });

  for (const [rel, entry] of Object.entries(ENTRIES))
    describe(rel, () => {
    it("rejeita requisição sem sessão, antes de tocar em dados", async () => {
      await expect(entry.run()).rejects.toThrow(entry.denied);
      expect(h.reachedData).not.toHaveBeenCalled();
      expect(h.ensureUser).not.toHaveBeenCalled();
      expect(h.syncSubscription).not.toHaveBeenCalled();
    });

    it("segue adiante com sessão válida", async () => {
      h.state.userId = "user_1";
      if (entry.authed === "reaches-data") {
        await expect(entry.run()).rejects.toThrow(h.REACHED_DATA);
        expect(h.reachedData).toHaveBeenCalled();
      } else {
        // Sem sessão a chamada teria lançado o erro de redirecionamento; com sessão, passa pelo portão.
        await expect(entry.run()).resolves.toBeDefined();
        expect(h.ensureUser).toHaveBeenCalledWith("user_1");
      }
    });
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
