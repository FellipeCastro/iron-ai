import OpenAI, { toFile } from "openai";
import { downloadFile, type TgVoice } from "@/lib/telegram/client";

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

/** Returns the transcript, or "" when nothing intelligible was said. */
export async function transcribeVoice(voice: TgVoice): Promise<string> {
  const { bytes, path } = await downloadFile(voice.file_id);
  const name = path.split("/").pop() || "voice.ogg";
  const file = await toFile(bytes, name, { type: voice.mime_type ?? "audio/ogg" });
  const result = await openai().audio.transcriptions.create({ file, model: OPENAI_TRANSCRIBE_MODEL, language: "pt", prompt: PROMPT });
  return result.text.trim();
}
