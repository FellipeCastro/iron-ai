import * as Sentry from "@sentry/node";
import { metadata, tasks } from "@trigger.dev/sdk";
import { sentryOptions } from "@/lib/sentry";
import type { TraceMetadata } from "@/lib/trace";

// Loaded by Trigger.dev before any task runs. The worker is a separate Node process from Next.js, so it
// needs its own Sentry client. Tracing works without registering an OpenTelemetry provider (the SDK
// default outside Next.js), so it does not compete with the one Trigger.dev uses for its run traces.
Sentry.init(sentryOptions);

// Every run is a `queue.process` transaction: a child of the webhook that enqueued it when the trace
// came along in the run metadata (lib/trace.ts), a new trace otherwise (cron runs). Logs and errors
// from the run carry the task and run ids, so a Sentry entry links back to the run.
tasks.middleware("sentry", async ({ ctx, next }) => {
  const trace = (metadata.get("sentry") ?? {}) as TraceMetadata["sentry"];
  await Sentry.withIsolationScope(async (scope) => {
    scope.setTag("trigger.task", ctx.task.id);
    scope.setAttributes({ trigger_task: ctx.task.id, trigger_run_id: ctx.run.id, trigger_attempt: ctx.attempt.number });
    try {
      await Sentry.continueTrace({ sentryTrace: trace["sentry-trace"], baggage: trace.baggage }, () =>
        Sentry.startSpan(
          {
            name: ctx.task.id,
            op: "queue.process",
            forceTransaction: true,
            attributes: {
              "messaging.system": "trigger.dev",
              "messaging.destination.name": ctx.task.id,
              "messaging.message.id": ctx.run.id,
              "messaging.message.retry.count": ctx.attempt.number - 1,
            },
          },
          () => next(),
        ),
      );
    } finally {
      // The worker may be frozen or exit right after the run; buffered spans and logs would be lost.
      await Sentry.flush(2000);
    }
  });
});

// Runs once the run has failed for good (retries exhausted or aborted), so transient attempts stay quiet.
tasks.onFailure("sentry", ({ ctx, error }) => {
  Sentry.captureException(error, { tags: { "trigger.task": ctx.task.id }, contexts: { trigger: { run_id: ctx.run.id } } });
});
