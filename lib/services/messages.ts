import { eq } from "drizzle-orm";
import { db, messages } from "@/db/client";

// The `messages` row of a Telegram update: one per `update_id`. It is both the log of what the bot did with the
// update and the guard that makes handling idempotent (see handleUpdate). Only the access lives here; the decisions
// about when to claim, finish or skip are the bot's.

export type MessageStatus = (typeof messages.$inferInsert)["status"];

/** Inserts the row for this update. False when an earlier delivery already created it (nothing is overwritten). */
export async function claimMessage(row: { updateId: number; userId: string | null; rawText: string | null }) {
  const [claimed] = await db.insert(messages).values(row).onConflictDoNothing({ target: messages.updateId }).returning({ id: messages.id });
  return Boolean(claimed);
}

export const findMessage = (updateId: number) => db.query.messages.findFirst({ where: eq(messages.updateId, updateId) });

/** Sets the final status and, in the same write, the replies still to deliver (so a retry can send them). */
export const finishMessage = (updateId: number, status: MessageStatus, parsedJson?: unknown, replies?: unknown[]) =>
  db
    .update(messages)
    .set({ status, parsedJson: parsedJson ?? null, replies: replies ?? null, repliesSent: 0 })
    .where(eq(messages.updateId, updateId));

/** Records that the first `count` replies reached the chat. */
export const setRepliesSent = (updateId: number, count: number) => db.update(messages).set({ repliesSent: count }).where(eq(messages.updateId, updateId));

export const setMessageUser = (updateId: number, userId: string) => db.update(messages).set({ userId }).where(eq(messages.updateId, updateId));

export const setMessageRawText = (updateId: number, rawText: string) => db.update(messages).set({ rawText }).where(eq(messages.updateId, updateId));
