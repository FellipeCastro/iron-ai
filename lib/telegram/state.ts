import { z } from "zod";
import { muscleGroup } from "@/db/schema";
import { ParsedMessage } from "@/lib/ai/schemas";

// Conversation state kept in telegram_links.chat_state between messages. Each pending step carries a
// short id that its buttons echo back, so taps on old keyboards are ignored.

const Ref = z.object({ id: z.string(), name: z.string() });
const Intent = ParsedMessage.shape.intent;

// `id: null` = not in the catalog; created as a custom exercise when the draft is saved.
export const RoutineDraft = z.array(
  z.object({
    title: z.string(),
    exercises: z.array(
      z.object({ id: z.string().nullable(), name: z.string(), sets: z.number().int(), muscleGroup: z.enum(muscleGroup.enumValues) }),
    ),
  }),
);
export type RoutineDraft = z.infer<typeof RoutineDraft>;

const Pending = z.discriminatedUnion("kind", [
  // Low-confidence parse waiting for "Registrar" / "Cancelar".
  z.object({ kind: z.literal("confirm"), id: z.string(), intent: Intent, overrides: z.record(z.string(), z.string()) }),
  // An exercise name matched several catalog entries; `slot` says which part of the intent it fills.
  z.object({
    kind: z.literal("pick"),
    id: z.string(),
    intent: Intent,
    overrides: z.record(z.string(), z.string()),
    slot: z.string(),
    candidates: z.array(Ref),
    confidence: z.number(),
  }),
  // Routine parsed from chat, waiting for "Salvar rotina".
  z.object({ kind: z.literal("routine"), id: z.string(), days: RoutineDraft }),
]);
export type Pending = z.infer<typeof Pending>;

export const ChatState = z.object({ pending: Pending.nullable() });
export type ChatState = z.infer<typeof ChatState>;

export function readChatState(raw: unknown): ChatState {
  const parsed = ChatState.safeParse(raw);
  return parsed.success ? parsed.data : { pending: null };
}

export const newPendingId = () => Math.random().toString(36).slice(2, 8);

// Callback data (≤ 64 bytes): "ok:<id>", "no:<id>", "p:<id>:<index>".
export type Callback = { action: "ok" | "no"; id: string } | { action: "pick"; id: string; index: number };

export function parseCallback(data: string | undefined): Callback | null {
  const [action, id, index] = (data ?? "").split(":");
  if (!id) return null;
  if (action === "ok" || action === "no") return { action, id };
  if (action === "p" && /^\d+$/.test(index ?? "")) return { action: "pick", id, index: Number(index) };
  return null;
}
