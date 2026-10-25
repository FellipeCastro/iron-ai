import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, linkTokens, telegramLinks, users } from "@/db";

/** The app user for a Clerk id, created on the fly if the Clerk webhook has not arrived yet. */
export async function ensureUser(clerkId: string) {
  const existing = await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) });
  if (existing) return existing;
  await db.insert(users).values({ clerkId }).onConflictDoNothing({ target: users.clerkId });
  return (await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) }))!;
}

/** Linked user for a Telegram chat. */
export async function findByChat(chatId: number) {
  const link = await db.query.telegramLinks.findFirst({ where: eq(telegramLinks.chatId, chatId), with: { user: true } });
  return link ?? null;
}

// ---------- Deep-link tokens ----------

export const LINK_TOKEN_TTL_MIN = 15;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Single-use token for t.me/<bot>?start=<token>. Only its hash is stored. */
export async function createLinkToken(userId: string) {
  // 24 bytes → 32 base64url chars, within Telegram's 64-char [A-Za-z0-9_-] start parameter.
  const token = randomBytes(24).toString("base64url");
  await db.insert(linkTokens).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + LINK_TOKEN_TTL_MIN * 60_000),
  });
  return token;
}

export type LinkResult = { ok: true; userId: string } | { ok: false; reason: "invalid" | "chat_taken" };

export async function consumeLinkToken(token: string, chatId: number, username: string | null): Promise<LinkResult> {
  const [claimed] = await db
    .update(linkTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(linkTokens.tokenHash, hashToken(token)), isNull(linkTokens.usedAt), gt(linkTokens.expiresAt, new Date())))
    .returning({ userId: linkTokens.userId });
  if (!claimed) return { ok: false, reason: "invalid" };

  const other = await findByChat(chatId);
  if (other && other.userId !== claimed.userId) return { ok: false, reason: "chat_taken" };

  // One chat per account: linking again (new phone, new chat) replaces the previous chat.
  await db
    .insert(telegramLinks)
    .values({ userId: claimed.userId, chatId, username, chatState: null })
    .onConflictDoUpdate({ target: telegramLinks.userId, set: { chatId, username, chatState: null, linkedAt: new Date() } });
  return { ok: true, userId: claimed.userId };
}

export const unlinkTelegram = (userId: string) => db.delete(telegramLinks).where(eq(telegramLinks.userId, userId));
