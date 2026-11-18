import OpenAI, { toFile } from "openai";
import { downloadFile, type TgVoice } from "@/lib/telegram/client";
import { recordAiUsage, releaseAiBudgetSafe, reserveAiBudget } from "@/lib/limits";
import { priceOf, type TokenUsage } from "./pricing";

// Voice notes become plain text and then follow the exact same path as a typed message (fast path, parser,
// confirmations). The transcript never reaches the user as a reply; only the parsed intent does.

export const OPENAI_TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe";

/** A logged set takes seconds to say; anything longer is not a set and would only cost money. */
export const MAX_VOICE_SECONDS = 60;

// Biases the model toward the vocabulary of the bot, so "10 por 25 quilos" is not heard as prose.
const PROMPT = "Mensagem curta de treino de musculação em português do Brasil: nome do exercício, repetições e carga em kg. Ex.: supino 10 reps 20 quilos; remada 3 por 12 com 40; terminei.";

let client: OpenAI | null = null;
const openai = () => (client ??= new OpenAI({ maxRetries: 1, timeout: 30_000 }));

export const voiceTooLong = (voice: TgVoice) => voice.duration > MAX_VOICE_SECONDS;

// Audio is roughly 10 tokens per second; used only when the response carries no token usage.
const AUDIO_TOKENS_PER_SECOND = 10;

/**
 * Returns the transcript, or "" when nothing intelligible was said. Throws BudgetExceededError /
 * UserBudgetExceededError when a daily ceiling is hit, before any paid request is made.
 */
export async function transcribeVoice(voice: TgVoice, userId: string): Promise<string> {
  // Reserved before the paid call (see limits.ts). Audio is billed per input token, so the estimate follows the duration.
  const estimate = Math.max(0.0001, Math.ceil(((voice.duration * AUDIO_TOKENS_PER_SECOND * priceOf(OPENAI_TRANSCRIBE_MODEL).input) / 1_000_000) * 1e4) / 1e4);
  const reservation = await reserveAiBudget(userId, estimate);
  let result;
  try {
    const { bytes, path } = await downloadFile(voice.file_id);
    // Telegram serves voice notes as "*.oga" (Ogg/Opus), an extension OpenAI rejects ("Unsupported file format oga").
    // The bytes are valid Ogg, so only the name has to change.
    const original = path.split("/").pop() || "voice.ogg";
    const name = original.replace(/\.oga$/i, ".ogg");
    const file = await toFile(bytes, name, { type: "audio/ogg" });
    result = await openai().audio.transcriptions.create({ file, model: OPENAI_TRANSCRIBE_MODEL, language: "pt", prompt: PROMPT });
  } catch (err) {
    await releaseAiBudgetSafe(reservation);
    throw err;
  }
  const usage: TokenUsage =
    result.usage?.type === "tokens"
      ? { inputTokens: result.usage.input_tokens, cachedInputTokens: 0, outputTokens: result.usage.output_tokens }
      : { inputTokens: Math.ceil(voice.duration * AUDIO_TOKENS_PER_SECOND), cachedInputTokens: 0, outputTokens: 0 };
  await recordAiUsage(userId, OPENAI_TRANSCRIBE_MODEL, usage, false, reservation);
  return result.text.trim();
}
