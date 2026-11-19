import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, idempotentRequests } from "@/db";

// Idempotency-Key for app operations that open a payment. The client generates a UUID v4 once per attempt and sends
// it again on every retry of that attempt; the operation then has effect once and every repeat gets the same answer.

/** The key was already used for a request with other parameters (e.g. another plan). */
export class IdempotencyKeyReusedError extends Error {
  constructor() {
    super("Idempotency key reused with different parameters");
    this.name = "IdempotencyKeyReusedError";
  }
}

/** Another request with the same key is still running and did not finish while this one waited. */
export class IdempotencyInProgressError extends Error {
  constructor() {
    super("A request with this idempotency key is still in progress");
    this.name = "IdempotencyInProgressError";
  }
}

const WAIT_MS = 10_000;
const POLL_MS = 150;
// A claim left without a response for this long belongs to a request that died mid-way: it may be taken over.
const STALE_CLAIM = sql`interval '30 seconds'`;

type Request = { userId: string; scope: string; key: string; fingerprint: string };

/**
 * Runs `operation` once per (user, scope, key) and returns its result; a repeat returns the saved result.
 *
 * The key is claimed (primary key insert) BEFORE the operation runs, so two requests sent at the same time cannot
 * both run it: the loser waits for the winner's result. A failed operation releases the claim and rethrows, so
 * retrying with the same key runs it again. `fingerprint` describes the parameters; a key reused with different
 * ones throws IdempotencyKeyReusedError instead of replaying an answer to another question.
 */
export async function runOnce<T>(req: Request, operation: () => Promise<T>): Promise<T> {
  if (!(await claim(req))) {
    const saved = await waitForResult<T>(req);
    if (saved.done) return saved.value;
    // Released after a failure, or taken over from a dead request: this request runs it.
  }

  let value: T;
  try {
    value = await operation();
  } catch (err) {
    await db.delete(idempotentRequests).where(and(sameKey(req), isNull(idempotentRequests.response))).catch(() => undefined);
    throw err;
  }
  // JSON null would read as "still in progress", so it is stored wrapped.
  await db.update(idempotentRequests).set({ response: { value } }).where(sameKey(req));
  return value;
}

const sameKey = ({ userId, scope, key }: Request) =>
  and(eq(idempotentRequests.userId, userId), eq(idempotentRequests.scope, scope), eq(idempotentRequests.key, key));

async function claim(req: Request) {
  const [row] = await db
    .insert(idempotentRequests)
    .values({ userId: req.userId, scope: req.scope, key: req.key, fingerprint: req.fingerprint })
    .onConflictDoNothing()
    .returning({ key: idempotentRequests.key });
  return Boolean(row);
}

/** Waits for the request holding the key. `done: false` means this request now holds the claim and must run. */
async function waitForResult<T>(req: Request): Promise<{ done: true; value: T } | { done: false }> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const row = await db.query.idempotentRequests.findFirst({
      where: sameKey(req),
      columns: { fingerprint: true, response: true },
    });
    if (!row) {
      if (await claim(req)) return { done: false };
      continue;
    }
    if (row.fingerprint !== req.fingerprint) throw new IdempotencyKeyReusedError();
    if (row.response !== null) return { done: true, value: (row.response as { value: T }).value };

    const [takenOver] = await db
      .update(idempotentRequests)
      .set({ createdAt: sql`now()` })
      .where(and(sameKey(req), isNull(idempotentRequests.response), sql`${idempotentRequests.createdAt} < now() - ${STALE_CLAIM}`))
      .returning({ key: idempotentRequests.key });
    if (takenOver) return { done: false };

    if (Date.now() > deadline) throw new IdempotencyInProgressError();
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
