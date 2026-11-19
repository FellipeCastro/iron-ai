import { vi } from "vitest";
import Stripe from "stripe";

// Dublês dos serviços externos. Estado em memória, zerado a cada teste por `resetMocks()`.

// ---------- Clerk ----------

export const clerkState = {
  userId: null as string | null,
  profiles: new Map<string, { firstName?: string | null; lastName?: string | null; email?: string }>(),
  deleteUserError: null as Error | null,
};

export const clerkMock = {
  getUser: vi.fn(async (id: string) => {
    const p = clerkState.profiles.get(id) ?? {};
    const email = p.email ?? `${id}@example.com`;
    return {
      id,
      firstName: p.firstName ?? null,
      lastName: p.lastName ?? null,
      primaryEmailAddress: { emailAddress: email },
      emailAddresses: [{ emailAddress: email }],
    };
  }),
  deleteUser: vi.fn(async (_id: string) => {
    if (clerkState.deleteUserError) throw clerkState.deleteUserError;
  }),
};

/** Como o `auth.protect()` do Clerk: sem sessão, interrompe a action/rota. */
export class UnauthorizedError extends Error {
  constructor() {
    super("Clerk: unauthenticated");
    this.name = "UnauthorizedError";
  }
}

export const clerkAuth = Object.assign(
  vi.fn(async () => ({
    userId: clerkState.userId,
    redirectToSignIn: ({ returnBackUrl }: { returnBackUrl?: string } = {}) =>
      new Response(null, {
        status: 307,
        headers: { location: `http://localhost:3000/sign-in?redirect_url=${encodeURIComponent(returnBackUrl ?? "")}` },
      }),
  })),
  {
    protect: vi.fn(async () => {
      if (!clerkState.userId) throw new UnauthorizedError();
      return { userId: clerkState.userId };
    }),
  },
);

export const clerkModule = {
  auth: clerkAuth,
  clerkClient: vi.fn(async () => ({ users: clerkMock })),
  currentUser: vi.fn(async () => (clerkState.userId ? clerkMock.getUser(clerkState.userId) : null)),
};

/** Simula a sessão do usuário logado (clerkId). `signOut()` remove a sessão. */
export const signIn = (clerkId: string) => void (clerkState.userId = clerkId);
export const signOut = () => void (clerkState.userId = null);

// ---------- Stripe ----------

type FakeSubscription = Partial<Stripe.Subscription> & { id: string; customer: string; status: string };

export const stripeState = {
  customers: new Map<string, { id: string; email?: string }>(),
  subscriptions: new Map<string, FakeSubscription>(),
  sessions: new Map<string, FakeCheckoutSession>(),
  charges: new Map<string, FakeCharge>(),
  idempotency: new Map<string, unknown>(),
  seq: 0,
  /** Faz o método falhar: `stripeState.fail.set("subscriptions.retrieve", new Error("boom"))`. */
  fail: new Map<string, Error>(),
};

const failIfSet = (name: string) => {
  const err = stripeState.fail.get(name);
  if (err) throw err;
};

/** Executa `create` uma vez por idempotencyKey, como o Stripe faz. */
function idempotent<T>(options: { idempotencyKey?: string } | undefined, scope: string, create: () => T): T {
  const key = options?.idempotencyKey && `${scope}:${options.idempotencyKey}`;
  if (key && stripeState.idempotency.has(key)) return stripeState.idempotency.get(key) as T;
  const value = create();
  if (key) stripeState.idempotency.set(key, value);
  return value;
}

type FakeCharge = { id: string; customer: string | null; refunded: boolean };

/** Como a Stripe: cobrança não cadastrada no Stripe falso não existe. */
async function retrieveCharge(id: string) {
  failIfSet("charges.retrieve");
  const charge = stripeState.charges.get(id);
  if (!charge) throw Object.assign(new Error(`No such charge: ${id}`), { code: "resource_missing" });
  return charge;
}

/** Como a Stripe: com a mesma idempotencyKey devolve a resposta guardada; sem ela, cancelar de novo é erro. */
async function cancelSubscription(id: string, _params?: unknown, options?: { idempotencyKey?: string }) {
  failIfSet("subscriptions.cancel");
  return idempotent(options, "subscription-cancel", () => {
    const sub = stripeState.subscriptions.get(id);
    if (!sub) throw new Error(`No such subscription: ${id}`);
    if (sub.status === "canceled") throw new Error(`Subscription ${id} is already canceled`);
    sub.status = "canceled";
    return { ...sub };
  });
}

type FakeCheckoutSession = { id: string; url: string | null; customer?: string; status: "open" | "complete" | "expired"; metadata: Record<string, string> };

async function createCheckoutSession(
  params: { customer?: string; metadata?: Record<string, string> },
  options?: { idempotencyKey?: string },
) {
  failIfSet("checkout.sessions.create");
  return idempotent(options, "checkout", () => {
    const id = `cs_test_${++stripeState.seq}`;
    const session: FakeCheckoutSession = { id, url: `https://checkout.stripe.test/${id}`, customer: params.customer, status: "open", metadata: params.metadata ?? {} };
    stripeState.sessions.set(id, session);
    return session;
  });
}

/** Como a Stripe: só sessões abertas têm `url`, e só uma sessão aberta pode ser expirada. */
async function listCheckoutSessions({ customer, status }: { customer?: string; status?: string }) {
  failIfSet("checkout.sessions.list");
  return { data: [...stripeState.sessions.values()].filter((s) => (!customer || s.customer === customer) && (!status || s.status === status)) };
}

async function expireCheckoutSession(id: string) {
  failIfSet("checkout.sessions.expire");
  const session = stripeState.sessions.get(id);
  if (!session || session.status !== "open") throw new Error(`Checkout Session ${id} is not expirable`);
  session.status = "expired";
  session.url = null;
  return session;
}

async function retrieveCheckoutSession(id: string): Promise<{ id: string; customer: string | null; subscription: string | null; status?: string }> {
  failIfSet("checkout.sessions.retrieve");
  // Sessões criadas pelo próprio Stripe falso existem; qualquer outra precisa ser configurada no teste.
  const known = stripeState.sessions.get(id);
  if (known) return { id, customer: known.customer ?? null, subscription: null, status: known.status };
  throw new Error(`Sessão ${id} não configurada no Stripe falso`);
}

// O SDK real só entra para verificar assinatura de webhook (`webhooks.constructEvent`) e gerar headers de teste.
const realStripe = new Stripe("sk_test_fake");

export const stripeMock = {
  webhooks: realStripe.webhooks,
  customers: {
    create: vi.fn(async (params: { email?: string }, options?: { idempotencyKey?: string }) => {
      failIfSet("customers.create");
      return idempotent(options, "customer", () => {
        const customer = { id: `cus_${++stripeState.seq}`, email: params.email };
        stripeState.customers.set(customer.id, customer);
        return customer;
      });
    }),
    del: vi.fn(async (id: string) => {
      failIfSet("customers.del");
      stripeState.customers.delete(id);
      for (const [subId, sub] of stripeState.subscriptions) if (sub.customer === id) stripeState.subscriptions.delete(subId);
      return { id, deleted: true };
    }),
  },
  subscriptions: {
    list: vi.fn(async ({ customer }: { customer: string }) => {
      failIfSet("subscriptions.list");
      return { data: [...stripeState.subscriptions.values()].filter((s) => s.customer === customer) };
    }),
    retrieve: vi.fn(async (id: string) => {
      failIfSet("subscriptions.retrieve");
      const sub = stripeState.subscriptions.get(id);
      if (!sub) throw new Error(`No such subscription: ${id}`);
      return sub;
    }),
    cancel: vi.fn(cancelSubscription),
  },
  checkout: {
    sessions: {
      create: vi.fn(createCheckoutSession),
      list: vi.fn(listCheckoutSessions),
      expire: vi.fn(expireCheckoutSession),
      // Configure por teste: `stripeMock.checkout.sessions.retrieve.mockResolvedValueOnce({ ... })`.
      retrieve: vi.fn(retrieveCheckoutSession),
    },
  },
  billingPortal: {
    sessions: {
      create: vi.fn(async ({ customer, return_url }: { customer: string; return_url: string }) => {
        failIfSet("billingPortal.sessions.create");
        return { url: `https://portal.stripe.test/${customer}?return=${encodeURIComponent(return_url)}` };
      }),
    },
  },
  charges: { retrieve: vi.fn(retrieveCharge) },
};

export const stripeModule = { stripe: () => stripeMock };

/** Registra no Stripe falso uma assinatura no estado dado e a devolve. */
export function putSubscription(
  sub: Partial<FakeSubscription> & { id: string; customer: string; status: string },
  priceId = process.env.STRIPE_PRICE_MONTHLY!,
) {
  const now = Math.floor(Date.now() / 1000);
  const full = {
    object: "subscription",
    cancel_at_period_end: false,
    trial_end: null,
    items: { data: [{ price: { id: priceId }, current_period_end: now + 30 * 86400, current_period_start: now }] },
    ...sub,
  } as FakeSubscription;
  stripeState.subscriptions.set(full.id, full);
  return full;
}

/** Registra no Stripe falso uma cobrança (lida pela task de eventos de risco). */
export function putCharge(charge: Partial<FakeCharge> & { id: string }) {
  const full = { customer: null, refunded: false, ...charge };
  stripeState.charges.set(full.id, full);
  return full;
}

// ---------- Trigger.dev ----------

export type AcceptedJob = { id: string; payload: unknown; options?: unknown };

/** Fila de jobs efetivamente aceitos pelo mock (chamadas rejeitadas nunca entram aqui). */
export const acceptedJobs: AcceptedJob[] = [];

export const triggerMock = {
  trigger: vi.fn(async (id: string, payload: unknown, options?: unknown) => {
    const run = { id: `run_${++stripeState.seq}` };
    acceptedJobs.push({ id, payload, options });
    return run;
  }),
};

type TaskDef = { id: string; run?: (payload: never, ...rest: never[]) => unknown };

/** `task({ id, run })` devolve o próprio objeto: os testes chamam `.run(payload)` direto contra o banco. */
export const triggerSdkModule = {
  task: (def: TaskDef) => def,
  schemaTask: (def: TaskDef) => def,
  concurrencyLimit: (def: unknown) => def,
  retry: { onThrow: <T>(fn: () => Promise<T>) => fn() },
  schedules: { task: (def: TaskDef) => def },
  tasks: { trigger: triggerMock.trigger, middleware: vi.fn(), onFailure: vi.fn() },
  idempotencyKeys: { create: vi.fn(async (key: string, options?: { scope?: string }) => `idem:${options?.scope ?? "run"}:${key}`) },
  metadata: { get: vi.fn(() => undefined), set: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  AbortTaskRunError: class AbortTaskRunError extends Error {},
};

// ---------- Sentry ----------

export const sentryMock = {
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  captureEvent: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  init: vi.fn(),
  flush: vi.fn(async () => true),
  getActiveSpan: vi.fn(() => undefined),
  getRootSpan: vi.fn(() => undefined),
  startSpan: vi.fn((_opts: unknown, cb: (span: unknown) => unknown) => cb({ setAttribute: vi.fn() })),
  continueTrace: vi.fn((_ctx: unknown, cb: () => unknown) => cb()),
  withIsolationScope: vi.fn((cb: (scope: unknown) => unknown) => cb({ setTag: vi.fn(), setAttributes: vi.fn() })),
  withServerActionInstrumentation: vi.fn((_name: string, _opts: unknown, cb: () => unknown) => cb()),
};

// ---------- Next.js ----------

export const nextCacheMock = {
  refresh: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
};

export const nextHeadersState = { headers: new Headers() };
export const nextHeadersMock = {
  headers: vi.fn(async () => nextHeadersState.headers),
  cookies: vi.fn(async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: vi.fn(), delete: vi.fn() })),
};

// ---------- Telegram (fetch para api.telegram.org) ----------

export type TelegramCall = { method: string; body: Record<string, unknown> };
export const telegramCalls: TelegramCall[] = [];
export const telegramState = { fail: new Map<string, { code: number; description: string }>() };

const realFetch = globalThis.fetch;

/** Intercepta chamadas à Bot API; qualquer outro host passa para o fetch real. */
export function installFetchStub() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const match = url.match(/^https:\/\/api\.telegram\.org\/bot[^/]+\/(\w+)/);
    if (!match) return realFetch(input, init);
    const method = match[1];
    telegramCalls.push({ method, body: init?.body ? JSON.parse(String(init.body)) : {} });
    const failure = telegramState.fail.get(method);
    const payload = failure
      ? { ok: false, error_code: failure.code, description: failure.description }
      : { ok: true, result: { message_id: telegramCalls.length, chat: { id: 0 } } };
    return new Response(JSON.stringify(payload), { status: failure?.code ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

/** Textos enviados pelo bot, em ordem. */
export const telegramTexts = () => telegramCalls.filter((c) => typeof c.body.text === "string").map((c) => c.body.text as string);

// ---------- OpenAI ----------

export const openaiState = {
  /** Resposta do modelo na próxima chamada de parse. */
  parsed: null as unknown,
  error: null as Error | null,
};
export const openaiParse = vi.fn(async (..._args: unknown[]) => {
  if (openaiState.error) throw openaiState.error;
  const parsed = openaiState.parsed;
  // O parser real usa `responses.create` e lê `output_text` (JSON); `output_parsed` fica por compatibilidade.
  return {
    output_parsed: parsed,
    output_text: parsed == null ? "" : JSON.stringify(parsed),
    usage: { input_tokens: 0, output_tokens: 0 },
  };
});
export const openaiTranscribe = vi.fn(async (..._args: unknown[]) => ({ text: "" }));

export class FakeOpenAI {
  // O parser faz `err instanceof OpenAI.APIError` para decidir se tenta o modelo de fallback.
  static APIError = class APIError extends Error {
    status?: number;
  };
  static APIConnectionError = class APIConnectionError extends Error {};
  responses = { parse: openaiParse, create: openaiParse };
  audio = { transcriptions: { create: openaiTranscribe } };
}

// ---------- Reset ----------

export function resetMocks() {
  clerkState.userId = null;
  clerkState.profiles.clear();
  clerkState.deleteUserError = null;
  stripeState.customers.clear();
  stripeState.subscriptions.clear();
  stripeState.sessions.clear();
  stripeState.charges.clear();
  stripeState.idempotency.clear();
  stripeState.fail.clear();
  stripeState.seq = 0;
  telegramCalls.length = 0;
  telegramState.fail.clear();
  openaiState.parsed = null;
  openaiState.error = null;
  nextHeadersState.headers = new Headers();
  // clearAllMocks não descarta `mockImplementationOnce` pendentes: sem isso, um override não consumido vaza para o próximo teste.
  stripeMock.checkout.sessions.create.mockReset().mockImplementation(createCheckoutSession);
  stripeMock.checkout.sessions.retrieve.mockReset().mockImplementation(retrieveCheckoutSession);
  stripeMock.charges.retrieve.mockReset().mockImplementation(retrieveCharge);
  stripeMock.subscriptions.cancel.mockReset().mockImplementation(cancelSubscription);
  vi.clearAllMocks();
}
