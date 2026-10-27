import "../db/env";
import { readFile } from "node:fs/promises";
import { fastParse } from "../lib/ai/fast-parse";
import { requestParse } from "../lib/ai/parse-message";
import { aiCostUsd, type TokenUsage } from "../lib/ai/pricing";
import { ParsedMessage, validateIntent } from "../lib/ai/schemas";

// Compares a candidate model with the answers stored in scripts/golden/golden.json (made by
// scripts/export-golden.ts) and reports agreement, tokens and estimated cost per message. Messages run
// with an empty routine/session context, so ones that lean on conversation ("mais uma de 9") may differ
// for reasons unrelated to the model: read the disagreement list before deciding.
// Usage: npm run ai:eval -- <model> [--fast]   (--fast also checks the shortcut against the stored answers)

type Golden = { text: string; expected: { intent: ParsedMessage["intent"] } };

const key = (i: ParsedMessage["intent"]) =>
  i.type === "log_sets" ? JSON.stringify(i.groups.map((g) => [g.reps, g.sets, g.weight_kg])) : i.type;

async function main() {
  const model = process.argv[2];
  if (!model) throw new Error("Usage: npm run ai:eval -- <model> [--fast]");
  const golden: Golden[] = JSON.parse(await readFile("scripts/golden/golden.json", "utf8"));
  const ctx = { routine: [], today: null, sessionSets: [], onboarding: false };

  let agree = 0;
  let cost = 0;
  const disagreements: string[] = [];
  for (const g of golden) {
    const { parsed, usage } = await requestParse(model, g.text, ctx);
    cost += aiCostUsd(model, usage as TokenUsage);
    const got = parsed ? validateIntent(ParsedMessage.parse(parsed)).intent : null;
    if (got && key(got) === key(g.expected.intent)) agree++;
    else disagreements.push(`${JSON.stringify(g.text)} → expected ${key(g.expected.intent)}, got ${got ? key(got) : "nothing"}`);
  }
  console.log(`${model}: ${agree}/${golden.length} agree (${((agree / golden.length) * 100).toFixed(1)}%), ~US$ ${(cost / golden.length).toFixed(5)} per message`);
  if (disagreements.length) console.log(`Disagreements:\n${disagreements.join("\n")}`);

  if (process.argv.includes("--fast")) {
    // The shortcut needs a catalog; an accept-anything pool isolates the pattern check from the matching.
    const pool = [{ id: "any", name: "any", aliases: [], priority: 0 }];
    let served = 0;
    let wrong = 0;
    for (const g of golden) {
      const fast = await fastParse(g.text, async () => pool.map((p) => ({ ...p, aliases: [normalizeKey(g.text)] })));
      if (!fast) continue;
      served++;
      if (key(fast.parsed.intent) !== key(g.expected.intent)) {
        wrong++;
        console.log(`FAST WRONG ${JSON.stringify(g.text)} → ${key(fast.parsed.intent)}, stored ${key(g.expected.intent)}`);
      }
    }
    console.log(`Fast path would serve ${served}/${golden.length} (${((served / golden.length) * 100).toFixed(1)}%), ${wrong} disagree with the stored answer`);
  }
}

// Makes the stand-in pool match whatever exercise name the pattern extracted.
const normalizeKey = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+\d.*$/, "");

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
