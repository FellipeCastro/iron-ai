import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { assertAiBudget, recordAiUsage } from "@/lib/limits";
import { buildParserInput, PARSER_INSTRUCTIONS, type ParserContext } from "./prompts";
import { ParsedMessage, validateIntent } from "./schemas";

// Model ids are env-overridable; both must support Structured Outputs (json_schema, strict) on the
// Responses API.
export const OPENAI_PARSER_MODEL = process.env.OPENAI_PARSER_MODEL ?? "gpt-5.4-mini";
export const OPENAI_FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL ?? "gpt-5.5";

const format = zodTextFormat(ParsedMessage, "parsed_message");

let client: OpenAI | null = null;
const openai = () => (client ??= new OpenAI({ maxRetries: 1, timeout: 20_000 }));

export type ParseResult = { parsed: ParsedMessage; model: string; budgetAlert: boolean };

async function callModel(model: string, text: string, ctx: ParserContext) {
  const response = await openai().responses.parse({
    model,
    instructions: PARSER_INSTRUCTIONS,
    input: buildParserInput(text, ctx),
    text: { format },
    store: false,
  });
  const budgetAlert = await recordAiUsage(response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0);
  return { parsed: response.output_parsed, budgetAlert };
}

/** Errors worth retrying on the fallback model (outages, overload), not bad requests or auth. */
const retryable = (err: unknown) =>
  err instanceof OpenAI.APIConnectionError ||
  (err instanceof OpenAI.APIError && (err.status === undefined || err.status === 429 || err.status >= 500));

/**
 * Turns a user message into a validated intent. Throws BudgetExceededError when the global daily
 * ceiling is hit. A refusal or empty output becomes a low-confidence clarification.
 */
export async function parseMessage(text: string, ctx: ParserContext): Promise<ParseResult> {
  await assertAiBudget();

  let model = OPENAI_PARSER_MODEL;
  let result;
  try {
    result = await callModel(model, text, ctx);
  } catch (err) {
    if (!retryable(err)) throw err;
    model = OPENAI_FALLBACK_MODEL;
    result = await callModel(model, text, ctx);
  }

  // The SDK already validated against the Zod schema; this re-checks ranges strict mode cannot express.
  const parsed = result.parsed
    ? validateIntent(ParsedMessage.parse(result.parsed))
    : { intent: { type: "clarify" as const, reason: "ambiguous" as const }, confidence: 0 };
  return { parsed, model, budgetAlert: result.budgetAlert };
}
