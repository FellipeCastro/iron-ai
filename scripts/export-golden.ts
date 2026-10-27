import "../db/env";
import { mkdir, writeFile } from "node:fs/promises";
import { and, desc, isNotNull } from "drizzle-orm";
import { db, messages } from "../db";

// Exports real messages and what the production parser made of them, as the reference set for
// scripts/eval-parser.ts (candidate models) and for checking the fast path. The file holds user text:
// it lives in scripts/golden/, which is gitignored. Raw text is only kept for 30 days (purge task).
// Usage: npm run ai:export-golden [-- <max rows>]

async function main() {
  const limit = Number(process.argv[2] ?? 500);
  const rows = await db
    .select({ text: messages.rawText, parsed: messages.parsedJson })
    .from(messages)
    .where(and(isNotNull(messages.rawText), isNotNull(messages.parsedJson)))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  const set = rows.filter((r) => r.text && !r.text.startsWith("/")).map((r) => ({ text: r.text!, expected: r.parsed }));
  await mkdir("scripts/golden", { recursive: true });
  await writeFile("scripts/golden/golden.json", JSON.stringify(set, null, 2));
  console.log(`Wrote ${set.length} messages to scripts/golden/golden.json. Review the labels by hand before trusting them.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
