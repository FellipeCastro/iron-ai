import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { fallbackEstimateUsd, parseEstimateUsd, recordAiUsage, releaseAiBudgetSafe, reserveAiBudget, reserveFallback } from "@/lib/limits";
import type { TokenUsage } from "./pricing";
import { buildParserInput, PARSER_INSTRUCTIONS, type ParserContext } from "./prompts";
import { ParsedMessage, validateIntent } from "./schemas";

// Model ids are env-overridable; both must support Structured Outputs (json_schema, strict) on the
// Responses API.
export const OPENAI_PARSER_MODEL = process.env.OPENAI_PARSER_MODEL ?? "gpt-5.4-mini";
export const OPENAI_FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL ?? "gpt-5.5";

// Bump when PARSER_INSTRUCTIONS or the schema change, so the cache key follows the shared prompt prefix.
const PROMPT_CACHE_KEY = "parser-v2";

const format = zodTextFormat(ParsedMessage, "parsed_message");

let client: OpenAI | null = null;
const openai = () => (client ??= new OpenAI({ maxRetries: 1, timeout: 20_000 }));

export type ParseResult = {
  parsed: ParsedMessage;
  model: string;
  /** True when the primary model failed and the fallback answered. */
  fallback: boolean;
  usage: TokenUsage;
  budgetAlert: boolean;
};

/**
 * One Responses API call, without budget bookkeeping (also used by scripts/eval-parser.ts). Reasoning is
 * off: the task is extraction, and the fallback model would otherwise default to medium effort and bill
 * hidden reasoning tokens as output.
 */
export async function requestParse(model: string, text: string, ctx: ParserContext) {
  // `create` + manual parse (not `responses.parse`): that helper throws on bad JSON without exposing the
  // response, which would lose the usage OpenAI already billed.
  const response = await openai().responses.create({
    model,
    instructions: PARSER_INSTRUCTIONS,
    input: buildParserInput(text, ctx),
    text: { format },
    reasoning: { effort: "none" },
    prompt_cache_key: PROMPT_CACHE_KEY,
    store: false,
  });
  const usage: TokenUsage = {
    inputTokens: response.usage?.input_tokens ?? 0,
    cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
  try {
    // Empty output (e.g. a refusal) yields null, which parseMessage turns into a clarification.
    const parsed = response.output_text ? ParsedMessage.parse(JSON.parse(response.output_text)) : null;
    return { parsed, usage };
  } catch (cause) {
    throw new ParseOutputError(usage, cause);
  }
}

/** The model answered (and was billed) but its output failed JSON/schema validation. Carries the usage to settle. */
export class ParseOutputError extends Error {
  constructor(
    readonly usage: TokenUsage,
    cause: unknown,
  ) {
    super("Model output failed validation", { cause });
    this.name = "ParseOutputError";
  }
}

/** Errors worth retrying on the fallback model (outages, overload), not bad requests or auth. */
const retryable = (err: unknown) =>
  err instanceof OpenAI.APIConnectionError ||
  (err instanceof OpenAI.APIError && (err.status === undefined || err.status === 429 || err.status >= 500));

/**
 * Turns a user message into a validated intent. Throws BudgetExceededError / UserBudgetExceededError when
 * a daily ceiling is hit. A refusal or empty output becomes a low-confidence clarification.
 */
export async function parseMessage(text: string, ctx: ParserContext, userId: string): Promise<ParseResult> {
  // Reserved before the paid call, so a burst of calls cannot all pass the same check (see limits.ts).
  const reservation = await reserveAiBudget(userId, parseEstimateUsd());

  let model = OPENAI_PARSER_MODEL;
  let result;
  try {
    try {
      result = await requestParse(model, text, ctx);
    } catch (err) {
      // The fallback bills ~7x the primary: once its own daily ceiling is spent, fail instead of paying more.
      if (!retryable(err) || !(await reserveFallback(reservation, fallbackEstimateUsd()))) throw err;
      model = OPENAI_FALLBACK_MODEL;
      result = await requestParse(model, text, ctx);
    }
  } catch (err) {
    if (err instanceof ParseOutputError) {
      // The call completed and was billed: settle the real cost instead of releasing the reservation.
      try {
        await recordAiUsage(userId, model, err.usage, model !== OPENAI_PARSER_MODEL, reservation);
      } catch {
        // Idempotent: a no-op if recordAiUsage already closed the row, otherwise the sweep-safe fallback.
        await releaseAiBudgetSafe(reservation);
      }
    } else {
      await releaseAiBudgetSafe(reservation);
    }
    throw err;
  }
  const fallback = model !== OPENAI_PARSER_MODEL;
  const budgetAlert = await recordAiUsage(userId, model, result.usage, fallback, reservation);

  // The SDK already validated against the Zod schema; this re-checks ranges strict mode cannot express.
  const parsed = result.parsed
    ? validateIntent(ParsedMessage.parse(result.parsed))
    : { intent: { type: "clarify" as const, reason: "ambiguous" as const }, confidence: 0 };
  return { parsed, model, fallback, usage: result.usage, budgetAlert };
}
