import { numberEnv } from "@/lib/env";

// USD per million tokens. Models outside the table fall back to the OPENAI_PRICE_* env values, so a
// custom OPENAI_PARSER_MODEL still gets a (conservative) estimate until it is added here.
export type Price = { input: number; cachedInput: number; output: number };

export const PRICES: Record<string, Price> = {
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
  // Transcription models bill audio input tokens (no cache discount); the audio rate is used for all input.
  "gpt-4o-mini-transcribe": { input: 3, cachedInput: 3, output: 5 },
  "gpt-4o-transcribe": { input: 6, cachedInput: 6, output: 10 },
};

export function priceOf(model: string): Price {
  const known = PRICES[model];
  if (known) return known;
  const input = numberEnv("OPENAI_PRICE_INPUT_USD_PER_MTOK", 1);
  return {
    input,
    cachedInput: numberEnv("OPENAI_PRICE_CACHED_INPUT_USD_PER_MTOK", input * 0.1),
    output: numberEnv("OPENAI_PRICE_OUTPUT_USD_PER_MTOK", 6),
  };
}

export type TokenUsage = { inputTokens: number; cachedInputTokens: number; outputTokens: number };

/** Cost of one call. `inputTokens` includes the cached ones, which are billed at the cached rate. */
export function aiCostUsd(model: string, usage: TokenUsage) {
  const price = priceOf(model);
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens);
  return ((usage.inputTokens - cached) * price.input + cached * price.cachedInput + usage.outputTokens * price.output) / 1_000_000;
}
