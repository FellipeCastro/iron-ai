import { beforeEach, vi } from "vitest";
import { assertTestDatabase } from "./env";
import { truncateAll } from "./helpers/db";
import {
  clerkModule,
  FakeOpenAI,
  installFetchStub,
  nextCacheMock,
  nextHeadersMock,
  resetMocks,
  sentryMock,
  stripeModule,
  triggerSdkModule,
} from "./helpers/mocks";

// Roda antes de cada arquivo de teste. Só o que é externo é simulado: banco, regras de negócio e a
// lógica de acesso rodam de verdade.

vi.mock("@clerk/nextjs/server", () => clerkModule);
vi.mock("@trigger.dev/sdk", () => triggerSdkModule);
vi.mock("@sentry/nextjs", () => sentryMock);
vi.mock("@sentry/node", () => sentryMock);
vi.mock("next/cache", () => nextCacheMock);
vi.mock("next/headers", () => nextHeadersMock);
vi.mock("openai", () => ({ default: FakeOpenAI }));
vi.mock("openai/helpers/zod", () => ({ zodTextFormat: (_schema: unknown, name: string) => ({ type: "json_schema", name }) }));
// Mantém `planOf`/`priceId` reais; troca só o cliente do Stripe (a verificação de assinatura de webhook segue real).
vi.mock("@/lib/stripe", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/stripe")>()), ...stripeModule }));

installFetchStub();

// Segunda trava (a primeira é o globalSetup): se o ambiente mudou, nenhum teste roda.
assertTestDatabase(process.env.DATABASE_URL, process.env.TEST_DB_HOST);

beforeEach(async () => {
  assertTestDatabase(process.env.DATABASE_URL, process.env.TEST_DB_HOST);
  resetMocks();
  await truncateAll();
});
