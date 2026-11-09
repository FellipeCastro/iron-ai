// Plan prices shown on the site. They must match the Stripe prices (see scripts/stripe-setup-plans.ts).

export const MONTHLY_PRICE = 14.9;
/** The annual plan is 12 monthly installments with a 12-month commitment (STRIPE_PRICE_ANNUAL). */
export const ANNUAL_INSTALLMENT_PRICE = 11.58;
export const ANNUAL_INSTALLMENTS = 12;
export const ANNUAL_PRICE = Math.round(ANNUAL_INSTALLMENT_PRICE * ANNUAL_INSTALLMENTS * 100) / 100;
export const ANNUAL_SAVINGS = Math.round((MONTHLY_PRICE * ANNUAL_INSTALLMENTS - ANNUAL_PRICE) * 100) / 100;

export const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
