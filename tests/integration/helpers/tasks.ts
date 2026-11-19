import { processStripeEvent } from "@/trigger/stripe-events";
import { triggerMock } from "./mocks";

// As tarefas do Trigger.dev são simuladas como objetos `{ id, run }` (ver mocks.ts): aqui se executa o `run`
// direto, contra o banco real, sem o worker do Trigger.
export function runTask<P, R = unknown>(task: unknown, payload: P): Promise<R> {
  return (task as { run: (payload: P) => Promise<R> }).run(payload);
}

/**
 * Roda `fn` (ex.: POSTs no webhook do Stripe) e, em seguida, as runs `stripe-event` que ela enfileirou, como o worker
 * do Trigger.dev faria. Igual ao Trigger.dev, só existe 1 run por idempotencyKey: um trigger repetido não roda de novo.
 */
export async function withStripeTasks<T>(fn: () => Promise<T>): Promise<T> {
  const before = triggerMock.trigger.mock.calls.length;
  const result = await fn();
  const seen = new Set<string>();
  for (const [id, payload, options] of triggerMock.trigger.mock.calls.slice(before)) {
    if (id !== "stripe-event") continue;
    const key = (options as { idempotencyKey?: string } | undefined)?.idempotencyKey;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    await runTask(processStripeEvent, payload);
  }
  return result;
}

/** As runs `stripe-event` enfileiradas até agora (payloads). */
export const stripeTaskCalls = () => triggerMock.trigger.mock.calls.filter(([id]) => id === "stripe-event");
