import * as Sentry from "@sentry/node";
import { logger } from "@trigger.dev/sdk";

// Task logs go to both the run page (Trigger.dev) and Sentry Logs, where they sit next to app errors and
// can be queried across runs. Attributes are snake_case, opaque ids only: no names, chat ids or texts.

type Attributes = Record<string, string | number | boolean | null | undefined>;

/** Drops absent values so they don't show up as empty columns in Sentry. */
const present = (attrs: Attributes) => Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== undefined && v !== null));

export const log = {
  info(message: string, attrs: Attributes = {}) {
    logger.info(message, attrs);
    Sentry.logger.info(message, present(attrs));
  },
  warn(message: string, attrs: Attributes = {}) {
    logger.warn(message, attrs);
    Sentry.logger.warn(message, present(attrs));
  },
  error(message: string, attrs: Attributes = {}) {
    logger.error(message, attrs);
    Sentry.logger.error(message, present(attrs));
  },
};

/** Stable error description for attributes: the class and Telegram/HTTP code, never the free-text message. */
export function errorAttrs(err: unknown): Attributes {
  if (!(err instanceof Error)) return { error_type: typeof err };
  const code = (err as { code?: unknown; status?: unknown }).code ?? (err as { status?: unknown }).status;
  return { error_type: err.constructor.name, error_code: typeof code === "number" ? code : undefined };
}
