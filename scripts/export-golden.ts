import "../db/env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, isNotNull } from "drizzle-orm";
import { db, messages } from "../db/client";
import { ParsedMessage } from "../lib/ai/schemas";
import { EMPTY_CONTEXT, GOLDEN_PATH, type GoldenCase } from "./golden-shared";

// Builds scripts/golden/golden.json from real messages (kept 30 days, see the purge cron) so a model can be
// evaluated on them. The file is git-ignored: it holds user text. Already reviewed cases are kept as they are.
// Usage: npm run ai:export-golden -- [limit, default 200]

async function main() {
  const limit = Number(process.argv[2] ?? 200);
  if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be a positive integer");

  let existing: GoldenCase[] = [];
  try {
    existing = JSON.parse(await readFile(GOLDEN_PATH, "utf8"));
  } catch {}
  const seen = new Set(existing.map((c) => c.text.trim().toLowerCase()));

  const rows = await db
    .select({ rawText: messages.rawText, parsedJson: messages.parsedJson })
    .from(messages)
    .where(and(isNotNull(messages.rawText), isNotNull(messages.parsedJson)))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  const added: GoldenCase[] = [];
  for (const row of rows) {
    const text = row.rawText!.trim();
    if (!text || text.startsWith("/")) continue; // commands and button callbacks never reach the parser
    const key = text.toLowerCase();
    const parsed = ParsedMessage.safeParse(row.parsedJson);
    if (seen.has(key) || !parsed.success) continue;
    seen.add(key);
    added.push({ text, context: EMPTY_CONTEXT, expected: parsed.data.intent, reviewed: false });
  }

  await mkdir(path.dirname(GOLDEN_PATH), { recursive: true });
  await writeFile(GOLDEN_PATH, JSON.stringify([...existing, ...added], null, 2) + "\n");
  console.log(`${added.length} new case(s) added, ${existing.length} kept → ${GOLDEN_PATH}`);
  console.log('Review each one by hand: fix "expected", add "context" when the message depends on earlier sets, set "reviewed": true.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
