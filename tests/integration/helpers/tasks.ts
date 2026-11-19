import { processStripeEvent } from "@/trigger/stripe-events";
import { acceptedJobs, triggerMock, type AcceptedJob } from "./mocks";

// As tarefas do Trigger.dev são simuladas como objetos `{ id, run }` (ver mocks.ts): aqui se executa o `run`
// direto, contra o banco real, sem o worker do Trigger.
export function runTask<P, R = unknown>(task: unknown, payload: P): Promise<R> {
  return (task as { run: (payload: P) => Promise<R> }).run(payload);
}

// Estado compartilhado: jobs já executados (cada job aceito é um objeto novo, então o WeakSet não vaza entre testes).
const consumedJobs = new WeakSet<object>();

/**
 * Roda `fn` (ex.: POSTs no webhook do Stripe) e, em seguida, as runs `stripe-event` que ela enfileirou, como o worker
 * do Trigger.dev faria. Igual ao Trigger.dev, só existe 1 run por idempotencyKey: um trigger repetido não roda de novo.
 */
export async function withStripeTasks<T>(fn: () => Promise<T>): Promise<T> {
  const before = acceptedJobs.length;
  const result = await fn();
  const seen = new Set<string>();
  // Consome a fila de jobs aceitos pelo mock (triggers rejeitados nunca entram nela). Reivindica
  // (sincronamente, antes de qualquer await) os ainda não consumidos, para que wrappers sobrepostos
  // nunca rodem o mesmo job duas vezes.
  const claimed: AcceptedJob[] = [];
  for (const job of acceptedJobs.slice(before)) {
    if (job.id !== "stripe-event" || consumedJobs.has(job)) continue;
    consumedJobs.add(job);
    claimed.push(job);
  }
  for (const { payload, options } of claimed) {
    const key = (options as { idempotencyKey?: string } | undefined)?.idempotencyKey;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    await runTask(processStripeEvent, payload);
  }
  return result;
}

/**
 * As runs `stripe-event` enfileiradas até agora. Igual ao Trigger.dev, um trigger repetido com a mesma idempotencyKey
 * reaproveita a run existente e não conta como outra.
 */
export const stripeTaskCalls = () => {
  const seen = new Set<string>();
  return triggerMock.trigger.mock.calls.filter(([id, , options]) => {
    if (id !== "stripe-event") return false;
    const key = (options as { idempotencyKey?: string } | undefined)?.idempotencyKey;
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
