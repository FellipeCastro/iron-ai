import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { ANNUAL_PRICE, MONTHLY_PRICE } from "@/lib/pricing";

// Carrega o .env local se existir (em CI as variáveis vêm do ambiente e não são sobrescritas).
try {
  process.loadEnvFile(".env");
} catch {}

const { STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL, REQUIRE_STRIPE_PRICES } = process.env;

// Valor ausente ou de enfeite (ex.: `sk_test_placeholder`) não conta como credencial.
const real = (value?: string) => Boolean(value) && !/placeholder/i.test(value as string);
const configured = real(STRIPE_SECRET_KEY) && real(STRIPE_PRICE_MONTHLY) && real(STRIPE_PRICE_ANNUAL);
// O CI liga `REQUIRE_STRIPE_PRICES=1` quando tem o secret do Stripe: a partir daí, faltar credencial é falha.
const required = REQUIRE_STRIPE_PRICES === "1";

if (!configured && !required) {
  console.warn("[stripe-prices] pulado: defina STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY e STRIPE_PRICE_ANNUAL para conferir os preços exibidos.");
}

describe.runIf(required)("preços exibidos x Stripe: credenciais exigidas", () => {
  it("STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY e STRIPE_PRICE_ANNUAL estão definidos", () => {
    const missing = Object.entries({ STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL })
      .filter(([, value]) => !real(value))
      .map(([name]) => name);
    expect(missing, "REQUIRE_STRIPE_PRICES=1, mas faltam variáveis").toEqual([]);
  });
});

// Sem credenciais (e sem exigência), pula; com elas, garante que o preço exibido é o cobrado.
describe.skipIf(!configured)("preços exibidos x Stripe", () => {
  // O corpo do describe roda na coleta mesmo com skipIf: criar o cliente só dentro do teste.
  it.each([
    ["mensal", STRIPE_PRICE_MONTHLY, MONTHLY_PRICE, "month"],
    ["anual", STRIPE_PRICE_ANNUAL, ANNUAL_PRICE, "year"],
  ] as const)("plano %s bate com o preço do Stripe", async (_name, id, shown, interval) => {
    const stripe = new Stripe(STRIPE_SECRET_KEY as string);
    const price = await stripe.prices.retrieve(id as string);
    expect(price.active, "preço arquivado no Stripe: o checkout quebraria").toBe(true);
    expect(price.currency).toBe("brl");
    expect(price.recurring?.interval).toBe(interval);
    expect(price.recurring?.interval_count, "cobrança deve ser a cada 1 período, não multi-intervalo").toBe(1);
    expect(price.unit_amount).toBe(Math.round(shown * 100));
  });
});
