import type { ErrorEvent } from "@sentry/nextjs";

// Shared Sentry options: no PII. Workout texts, chat ids and request bodies never leave the app;
// errors are reported with their stack and route only. Disabled when no DSN is configured.

export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  // `sendDefaultPii` no longer gates these in SDK v11 and every category defaults to on. Spans skip
  // `beforeSend`, so this is what keeps message texts out of DB query params, OpenAI spans, HTTP
  // bodies and stack-frame variables. Structure (queries, routes, models, tokens) is still recorded.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
  },
  // 100% of traces in dev, 10% in production; adjust to traffic volume. Runs started from a traced
  // request follow that request's decision, so a sampled Telegram message is traced end to end.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
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
