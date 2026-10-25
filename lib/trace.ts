import { getTraceData, startSpan } from "@sentry/core";

// Runtime-agnostic (Next.js server and the Trigger.dev worker both register a Sentry client).

export type TraceMetadata = { sentry: { "sentry-trace"?: string; baggage?: string } };

/**
 * Enqueues a Trigger.dev run inside a `queue.publish` span and hands the trace headers to it as run
 * metadata; trigger/init.ts continues the trace, so a webhook and the run it starts form one trace.
 */
export function enqueue<T>(taskId: string, trigger: (options: { metadata: TraceMetadata }) => Promise<T>): Promise<T> {
  return startSpan(
    { name: taskId, op: "queue.publish", attributes: { "messaging.system": "trigger.dev", "messaging.destination.name": taskId } },
    async (span) => {
      const { "sentry-trace": sentryTrace, baggage } = getTraceData();
      const handle = await trigger({ metadata: { sentry: { "sentry-trace": sentryTrace, baggage } } });
      const id = (handle as { id?: unknown; batchId?: unknown }).id ?? (handle as { batchId?: unknown }).batchId;
      if (typeof id === "string") span.setAttribute("messaging.message.id", id);
      return handle;
    },
  );
}
