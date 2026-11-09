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

// `at` (epoch ms) is stamped when the step is saved; a step without it or past its TTL is dropped on read, so an
// unanswered question can never swallow a message sent hours or days later.
const Pending = z.discriminatedUnion("kind", [
  // Low-confidence parse waiting for "Registrar" / "Cancelar".
  z.object({ kind: z.literal("confirm"), id: z.string(), at: z.number().optional(), intent: Intent, overrides: z.record(z.string(), z.string()) }),
  // An exercise name matched several catalog entries; `slot` says which part of the intent it fills.
  z.object({
    kind: z.literal("pick"),
    id: z.string(),
    at: z.number().optional(),
    intent: Intent,
    overrides: z.record(z.string(), z.string()),
    slot: z.string(),
    candidates: z.array(Ref),
    confidence: z.number(),
  }),
  // Routine parsed from chat, waiting for "Salvar rotina".
  z.object({ kind: z.literal("routine"), id: z.string(), at: z.number().optional(), days: RoutineDraft }),
  // Onboarding step 2: waiting for the training weekdays as text ("segunda, quarta e sexta").
  z.object({ kind: z.literal("days"), id: z.string(), at: z.number().optional() }),
  // Onboarding step 3: waiting for the training time as text ("18:30"), or "sem lembrete".
  z.object({ kind: z.literal("time"), id: z.string(), at: z.number().optional() }),
  // Session just closed: "Confirmar" keeps the duration, "Editar" waits for the real one as text.
  z.object({ kind: z.literal("duration"), id: z.string(), at: z.number().optional(), sessionId: z.string(), minutes: z.number() }),
  z.object({ kind: z.literal("duration_edit"), id: z.string(), at: z.number().optional(), sessionId: z.string() }),
]);
export type Pending = z.infer<typeof Pending>;

// Day the user asked to train instead of the suggested one. `at` (epoch ms) bounds how long it holds.
const DayOverride = z.object({ letter: z.string(), at: z.number() });

export const ChatState = z.object({ pending: Pending.nullable(), dayOverride: DayOverride.nullable().optional() });
export type ChatState = z.infer<typeof ChatState>;

const HOUR = 3_600_000;
/** How long a step keeps waiting for its answer. Onboarding is slower than a button tap or a duration. */
const PENDING_TTL_MS: Record<Pending["kind"], number> = {
  confirm: HOUR,
  pick: HOUR,
  duration: 3 * HOUR,
  duration_edit: 3 * HOUR,
  routine: 24 * HOUR,
  days: 24 * HOUR,
  time: 24 * HOUR,
};

/** Day choices stop applying after this: the next training day starts from the rotation again. */
const DAY_OVERRIDE_TTL_MS = 16 * HOUR;

export const stampPending = (state: ChatState, now = Date.now()): ChatState =>
  state.pending ? { ...state, pending: { ...state.pending, at: now } } : state;

export function readChatState(raw: unknown, now = Date.now()): ChatState {
  const parsed = ChatState.safeParse(raw);
  if (!parsed.success) return { pending: null };
  const { pending, dayOverride } = parsed.data;
  const override = dayOverride && now - dayOverride.at <= DAY_OVERRIDE_TTL_MS ? dayOverride : null;
  // Steps saved before `at` existed are treated as expired: they are the ones that got stuck.
  const live = pending && pending.at !== undefined && now - pending.at <= PENDING_TTL_MS[pending.kind] ? pending : null;
  return { pending: live, dayOverride: override };
}

export const newPendingId = () => Math.random().toString(36).slice(2, 8);

// Callback data (≤ 64 bytes): "ok:<id>", "no:<id>", "ed:<id>", "p:<id>:<index>".
export type Callback = { action: "ok" | "no" | "edit"; id: string } | { action: "pick"; id: string; index: number };

export function parseCallback(data: string | undefined): Callback | null {
  const [action, id, index] = (data ?? "").split(":");
  if (!id) return null;
  if (action === "ok" || action === "no") return { action, id };
  if (action === "ed") return { action: "edit", id };
  if (action === "p" && /^\d+$/.test(index ?? "")) return { action: "pick", id, index: Number(index) };
  return null;
}
