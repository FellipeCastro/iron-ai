// As tarefas do Trigger.dev são simuladas como objetos `{ id, run }` (ver mocks.ts): aqui se executa o `run`
// direto, contra o banco real, sem o worker do Trigger.
export function runTask<P, R = unknown>(task: unknown, payload: P): Promise<R> {
  return (task as { run: (payload: P) => Promise<R> }).run(payload);
}
