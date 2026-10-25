export const SIGN_IN_URL = "/sign-in";
export const SIGN_UP_URL = "/sign-up";
export const DASHBOARD_URL = "/dashboard";
export const ROUTINE_URL = "/routine";
export const HISTORY_URL = "/history";
export const EXERCISES_URL = "/exercises";
export const SETTINGS_URL = "/settings";

export const exerciseUrl = (id: string) => `${EXERCISES_URL}/${id}`;

export const APP_NAV = [
  { label: "Painel", href: DASHBOARD_URL },
  { label: "Rotina", href: ROUTINE_URL },
  { label: "Histórico", href: HISTORY_URL },
  { label: "Evolução", href: EXERCISES_URL },
  { label: "Configurações", href: SETTINGS_URL },
] as const;
