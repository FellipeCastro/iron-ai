import "../db/env";
import { readFile } from "node:fs/promises";
import { fastParse } from "../lib/ai/fast-parse";
import { OPENAI_PARSER_MODEL, requestParse } from "../lib/ai/parse-message";
import { aiCostUsd } from "../lib/ai/pricing";
import { ParsedMessage, validateIntent } from "../lib/ai/schemas";
import type { MatchCandidate } from "../lib/engine/match";
import { catalog } from "../db/seed/exercises";
import { GOLDEN_PATH, sameValue, type GoldenCase } from "./golden-shared";

// Scores a model against the reviewed golden cases (see export-golden). Calls the real OpenAI API.
// Usage: npm run ai:eval -- [model] [--fast]
//   model  defaults to OPENAI_PARSER_MODEL
//   --fast also reports how many cases the deterministic shortcut answers and whether it is right

const args = process.argv.slice(2);
const withFast = args.includes("--fast");
const model = args.find((a) => !a.startsWith("--")) ?? OPENAI_PARSER_MODEL;

const pool: MatchCandidate[] = catalog.map((c, i) => ({ id: String(i), name: c.name, aliases: c.aliases, priority: 0 }));

async function main() {
  const all: GoldenCase[] = JSON.parse(await readFile(GOLDEN_PATH, "utf8"));
  const cases = all.filter((c) => c.reviewed);
  if (cases.length === 0) throw new Error(`No reviewed cases in ${GOLDEN_PATH}. Run npm run ai:export-golden and review them first.`);
  console.log(`${model}: ${cases.length} reviewed case(s)${all.length > cases.length ? ` (${all.length - cases.length} unreviewed skipped)` : ""}\n`);

  let correct = 0;
  let cost = 0;
  const wrong: string[] = [];
  for (const c of cases) {
    try {
      const { parsed, usage } = await requestParse(model, c.text, c.context);
      cost += aiCostUsd(model, usage);
      const got = parsed ? validateIntent(ParsedMessage.parse(parsed)).intent : null;
      if (got && sameValue(got, c.expected)) correct++;
      else wrong.push(`"${c.text}"\n    expected ${JSON.stringify(c.expected)}\n    got      ${JSON.stringify(got)}`);
    } catch (err) {
      wrong.push(`"${c.text}"\n    error: ${err instanceof Error ? err.message : err}`);
    }
  }

  const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "n/a");
  console.log(`Accuracy: ${correct}/${cases.length} (${pct(correct, cases.length)}), target ≥ 95%`);
  console.log(`Cost: ~US$ ${cost.toFixed(4)}`);
  if (wrong.length) console.log(`\nMismatches:\n${wrong.join("\n")}`);

  if (withFast) {
    let answered = 0;
    let right = 0;
    for (const c of cases) {
      const fast = await fastParse(c.text, async () => pool);
      if (!fast) continue;
      answered++;
      if (sameValue(fast.parsed.intent, c.expected)) right++;
      else console.log(`\nFast path wrong on "${c.text}": ${JSON.stringify(fast.parsed.intent)}`);
    }
    console.log(`\nFast path: answers ${answered}/${cases.length} (${pct(answered, cases.length)}), right on ${right}/${answered} (${pct(right, answered)})`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
