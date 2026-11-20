import { saveState, type Ctx } from "@/lib/bot/context";
import type { Out } from "@/lib/bot/deliver";
import { CONFIRM_BELOW, execute } from "@/lib/bot/intents";
import { saveRoutineDraft } from "@/lib/bot/onboarding";
import * as render from "@/lib/telegram/render";
import { parseCallback, type Pending } from "@/lib/telegram/state";

// Taps on inline-keyboard buttons. A tap only counts when its id matches the step waiting in the chat state;
// otherwise the keyboard is an old one and the action has expired.

export async function handleCallback(ctx: Ctx, data: string | undefined): Promise<Out[]> {
  const cb = parseCallback(data);
  const pending: Pending | null = ctx.state.pending;
  if (!cb || !pending || pending.id !== cb.id) return [{ text: render.expiredAction() }];

  // Weekday and time steps are answered with text, never buttons.
  if (pending.kind === "days" || pending.kind === "time") return [{ text: render.expiredAction() }];

  await saveState(ctx, { pending: null });
  if (pending.kind === "duration" || pending.kind === "duration_edit") {
    if (cb.action === "ok" && pending.kind === "duration") return [{ text: render.durationConfirmed(pending.minutes) }];
    if (cb.action === "edit") {
      await saveState(ctx, { pending: { kind: "duration_edit", id: pending.id, sessionId: pending.sessionId } });
      return [{ text: render.askDurationEdit() }];
    }
    return [{ text: render.expiredAction() }];
  }
  if (cb.action === "no") return [{ text: render.cancelled() }];

  if (cb.action === "pick") {
    if (pending.kind !== "pick" || !pending.candidates[cb.index]) return [{ text: render.expiredAction() }];
    const overrides = { ...pending.overrides, [pending.slot]: pending.candidates[cb.index].id };
    // Picking the exercise is the confirmation the parser was missing.
    return execute(ctx, pending.intent, overrides, Math.max(pending.confidence, CONFIRM_BELOW), false);
  }

  if (pending.kind === "confirm") return execute(ctx, pending.intent, pending.overrides, 1, true);
  if (pending.kind === "routine") return saveRoutineDraft(ctx, pending.days);
  return [{ text: render.expiredAction() }];
}
