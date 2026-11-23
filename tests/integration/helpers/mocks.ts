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
  /** Pagamentos de fatura: `invoice id` → payment intents pagos (lidos ao estornar uma assinatura duplicada). */
  invoicePayments: new Map<string, string[]>(),
  refunds: [] as FakeRefund[],
  idempotency: new Map<string, unknown>(),
  seq: 0,
  /** Faz o método falhar: `stripeState.fail.set("subscriptions.retrieve", new Error("boom"))`. */
  fail: new Map<string, Error>(),
  /** Tamanho máximo de página das listagens (`null` = o `limit` pedido). Teste de paginação: `stripeState.pageSize = 1`. */
  pageSize: null as number | null,
};

/** Como a Stripe: mais novos primeiro, em páginas de `limit`, continuando depois de `starting_after`. */
function page<T extends { id: string; created?: number }>(items: T[], params: { limit?: number; starting_after?: string } = {}) {
  const sorted = [...items].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  const start = params.starting_after ? sorted.findIndex((i) => i.id === params.starting_after) + 1 : 0;
  const size = stripeState.pageSize ?? params.limit ?? 10;
  const data = sorted.slice(start, start + size);
  return { data, has_more: start + size < sorted.length };
}

/** Erro 5xx guardado pelo Stripe para uma idempotencyKey e devolvido de novo (header `idempotent-replayed`). */
export const stripeServerError = (replayed: boolean) =>
  Object.assign(new Error("An unknown error occurred"), {
    type: "StripeAPIError",
    statusCode: 500,
    headers: replayed ? { "idempotent-replayed": "true" } : {},
  });

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

type FakeCheckoutSession = {
  id: string;
  url: string | null;
  customer?: string;
  status: "open" | "complete" | "expired";
  metadata: Record<string, string>;
  created: number;
  subscription?: string | null;
};

async function createCheckoutSession(
  params: { customer?: string; metadata?: Record<string, string> },
  options?: { idempotencyKey?: string },
) {
  failIfSet("checkout.sessions.create");
  // Como a Stripe: a mesma chave com outros parâmetros (outro plano) é recusada, não devolve a Session guardada.
  const saved = options?.idempotencyKey && (stripeState.idempotency.get(`checkout:${options.idempotencyKey}`) as FakeCheckoutSession | undefined);
  if (saved && saved.metadata.plan !== params.metadata?.plan) {
    throw Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters they were first used with."), { type: "StripeIdempotencyError" });
  }
  return idempotent(options, "checkout", () => {
    const id = `cs_test_${++stripeState.seq}`;
    const session: FakeCheckoutSession = {
      id,
      url: `https://checkout.stripe.test/${id}`,
      customer: params.customer,
      status: "open",
      metadata: params.metadata ?? {},
      created: Math.floor(Date.now() / 1000),
    };
    stripeState.sessions.set(id, session);
    return session;
  });
}

type FakeRefund = { id: string; payment_intent: string; amount: number; metadata: Record<string, string> };

/** Como a Stripe: estornar de novo o mesmo pagamento (sem a mesma idempotencyKey) é erro `charge_already_refunded`. */
async function createRefund(params: { payment_intent: string; metadata?: Record<string, string> }, options?: { idempotencyKey?: string }) {
  failIfSet("refunds.create");
  return idempotent(options, "refund", () => {
    if (stripeState.refunds.some((r) => r.payment_intent === params.payment_intent)) {
      throw Object.assign(new Error(`Charge for ${params.payment_intent} has already been refunded`), { code: "charge_already_refunded" });
    }
    const refund = { id: `re_${++stripeState.seq}`, payment_intent: params.payment_intent, amount: 1000, metadata: params.metadata ?? {} };
    stripeState.refunds.push(refund);
    return refund;
  });
}

/** Como a Stripe: só sessões abertas têm `url`, e só uma sessão aberta pode ser expirada. */
async function listCheckoutSessions({ customer, status, ...params }: { customer?: string; status?: string; limit?: number; starting_after?: string }) {
  failIfSet("checkout.sessions.list");
  return page(
    [...stripeState.sessions.values()].filter((s) => (!customer || s.customer === customer) && (!status || s.status === status)),
    params,
  );
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
  if (known) return { id, customer: known.customer ?? null, subscription: known.subscription ?? null, status: known.status };
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
    list: vi.fn(async ({ customer, ...params }: { customer: string; limit?: number; starting_after?: string }) => {
      failIfSet("subscriptions.list");
      // Como a Stripe: sem `status`, a listagem não traz as canceladas.
      return page(
        [...stripeState.subscriptions.values()].filter((s) => s.customer === customer && s.status !== "canceled"),
        params,
      );
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
  invoices: {
    // Configure por teste: `stripeMock.invoices.retrieve.mockResolvedValueOnce({ status: "open", hosted_invoice_url: ... })`.
    retrieve: vi.fn(async (id: string): Promise<{ id: string; status: string; hosted_invoice_url: string | null }> => {
      failIfSet("invoices.retrieve");
      throw new Error(`Fatura ${id} não configurada no Stripe falso`);
    }),
  },
  invoicePayments: {
    list: vi.fn(async ({ invoice }: { invoice: string }) => ({
      data: (stripeState.invoicePayments.get(invoice) ?? []).map((pi) => ({ status: "paid", payment: { type: "payment_intent", payment_intent: pi } })),
    })),
  },
  refunds: {
    create: vi.fn(createRefund),
    // O Stripe falso não liga estorno a cobrança: devolve todos (a cobrança `ch_x` é estornada via pagamento `pi_x`).
    list: vi.fn(async ({ charge, ...params }: { charge: string; limit?: number; starting_after?: string }) =>
      page(stripeState.refunds.filter((r) => r.payment_intent === charge.replace(/^ch_/, "pi_")), params),
    ),
  },
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
    created: now,
    latest_invoice: null,
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
  stripeState.invoicePayments.clear();
  stripeState.refunds.length = 0;
  stripeState.idempotency.clear();
  stripeState.fail.clear();
  stripeState.pageSize = null;
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
  stripeMock.refunds.create.mockReset().mockImplementation(createRefund);
  vi.clearAllMocks();
}
