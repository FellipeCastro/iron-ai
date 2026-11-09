import "../db/env";
import Stripe from "stripe";
import { ANNUAL_INSTALLMENT_PRICE, MONTHLY_PRICE } from "../lib/plans";
import { requireEnv, siteUrl } from "../lib/env";
import { PRIVACY_URL, SETTINGS_URL, TERMS_URL } from "../lib/routes";

// Creates what the plans need in the Stripe account of STRIPE_SECRET_KEY (test or live) and prints the env vars:
//   - the monthly price (MONTHLY_PRICE) and the annual-in-12x price (ANNUAL_INSTALLMENT_PRICE, billed monthly),
//     both on the product of the current STRIPE_PRICE_MONTHLY;
//   - two Customer Portal configurations: "standard" (cancel at period end) and "commitment" (no cancel, for
//     annual subscribers inside the 12-month cycle). Neither switches plans: switching would break the cycle math.
// Prices are found by lookup key, so re-running reuses them; portal configurations are created on every run.
// Usage: npm run stripe:setup-plans

const cents = (value: number) => Math.round(value * 100);

async function main() {
  const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  const current = await stripe.prices.retrieve(requireEnv("STRIPE_PRICE_MONTHLY"));
  const product = typeof current.product === "string" ? current.product : current.product.id;

  async function price(lookupKey: string, nickname: string, amount: number) {
    const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
    if (found.data[0]) return found.data[0].id;
    const created = await stripe.prices.create({
      product,
      currency: "brl",
      unit_amount: cents(amount),
      recurring: { interval: "month" },
      nickname,
      lookup_key: lookupKey,
    });
    return created.id;
  }

  const monthly = await price(`iron_monthly_${cents(MONTHLY_PRICE)}`, "Mensal", MONTHLY_PRICE);
  const annual = await price(`iron_annual_12x_${cents(ANNUAL_INSTALLMENT_PRICE)}`, "Anual (12x, fidelidade 12 meses)", ANNUAL_INSTALLMENT_PRICE);

  const base = {
    business_profile: { privacy_policy_url: `${siteUrl()}${PRIVACY_URL}`, terms_of_service_url: `${siteUrl()}${TERMS_URL}` },
    default_return_url: `${siteUrl()}${SETTINGS_URL}`,
  };
  const common = {
    customer_update: { enabled: true, allowed_updates: ["email", "name"] as Stripe.BillingPortal.ConfigurationCreateParams.Features.CustomerUpdate.AllowedUpdate[] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_update: { enabled: false },
  };
  const standard = await stripe.billingPortal.configurations.create({
    ...base,
    name: "Iron AI - padrão",
    features: { ...common, subscription_cancel: { enabled: true, mode: "at_period_end" } },
  });
  const commitment = await stripe.billingPortal.configurations.create({
    ...base,
    name: "Iron AI - anual com fidelidade",
    features: { ...common, subscription_cancel: { enabled: false } },
  });

  console.log(`\nAtualize as variáveis (${current.livemode ? "LIVE" : "teste"}):\n`);
  // On a re-run the env already points at the new prices: then there is nothing to move to *_LEGACY.
  if (current.id !== monthly) console.log(`STRIPE_PRICE_MONTHLY_LEGACY=${current.id}`);
  const oldAnnual = process.env.STRIPE_PRICE_ANNUAL;
  if (oldAnnual && oldAnnual !== annual) console.log(`STRIPE_PRICE_ANNUAL_LEGACY=${oldAnnual}`);
  console.log(`STRIPE_PRICE_MONTHLY=${monthly}`);
  console.log(`STRIPE_PRICE_ANNUAL=${annual}`);
  console.log(`STRIPE_PORTAL_CONFIG_STANDARD=${standard.id}`);
  console.log(`STRIPE_PORTAL_CONFIG_COMMITMENT=${commitment.id}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
