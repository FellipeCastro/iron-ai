export const SIGN_IN_URL = "/sign-in";
export const SIGN_UP_URL = "/sign-up";
export const DASHBOARD_URL = "/dashboard";
export const ROUTINE_URL = "/routine";
export const HISTORY_URL = "/history";
export const EXERCISES_URL = "/exercises";
export const SETTINGS_URL = "/settings";
/** Plan picker: where sign-in lands and where users without a subscription are sent (see app/assinar/page.tsx). */
export const CHECKOUT_URL = "/assinar";
export const checkoutUrl = (plan: "monthly" | "annual") => `${CHECKOUT_URL}?plan=${plan}`;
/** Sign-up that lands on Checkout for the plan picked on the pricing cards. */
export const signUpForPlan = (plan: "monthly" | "annual") => `${SIGN_UP_URL}?redirect_url=${encodeURIComponent(checkoutUrl(plan))}`;
export const TERMS_URL = "/termos";
export const PRIVACY_URL = "/privacidade";

export const exerciseUrl = (id: string) => `${EXERCISES_URL}/${id}`;
export const sessionUrl = (id: string) => `${HISTORY_URL}/${id}`;

/** "Treinos" lands on the routine; history and progress live under it, so they keep the tab active. */
export const APP_NAV = [
  { label: "Painel", href: DASHBOARD_URL, match: [DASHBOARD_URL] },
  { label: "Treinos", href: ROUTINE_URL, match: [ROUTINE_URL, HISTORY_URL, EXERCISES_URL] },
  { label: "Configurações", href: SETTINGS_URL, match: [SETTINGS_URL] },
] as const;
