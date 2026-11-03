import { normalize } from "../lib/engine/match";
import type { ParserContext } from "../lib/ai/prompts";
import { ParsedMessage } from "../lib/ai/schemas";

// Shared by export-golden and eval-parser: the golden set is a JSON file of real messages with the intent
// a human confirmed for each one.

export const GOLDEN_PATH = "scripts/golden/golden.json";

export type GoldenCase = {
  text: string;
  /** What the parser is told about the conversation. Not stored with messages, so exports start empty. */
  context: ParserContext;
  /** What the bot understood when the message arrived. Edit it to the correct intent, then set `reviewed`. */
  expected: ParsedMessage["intent"];
  reviewed: boolean;
};

export const EMPTY_CONTEXT: ParserContext = { routine: [], today: null, sessionSets: [], onboarding: false };

/** Structural equality where exercise names compare as the matcher would read them (case, accents, spacing). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") return normalize(a) === normalize(b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => sameValue((a as Record<string, unknown>)[k] ?? null, (b as Record<string, unknown>)[k] ?? null));
  }
  return a === b;
}
