import type { ErrorEvent } from "@sentry/nextjs";

// Shared Sentry options: no PII. Workout texts, chat ids and request bodies never leave the app;
// errors are reported with their stack and route only. Disabled when no DSN is configured.

export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  beforeSend: scrub,
  beforeBreadcrumb: (breadcrumb: { category?: string }) => (breadcrumb.category === "console" ? null : breadcrumb),
};

export function scrub(event: ErrorEvent): ErrorEvent {
  delete event.user;
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
  }
  delete event.extra;
  return event;
}
