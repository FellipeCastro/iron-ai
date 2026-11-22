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

  if (pending.kind === "duration" || pending.kind === "duration_edit") {
    if (cb.action === "edit") {
      await saveState(ctx, { pending: { kind: "duration_edit", id: pending.id, sessionId: pending.sessionId } });
      return [{ text: render.askDurationEdit() }];
    }
    await saveState(ctx, { pending: null });
    if (cb.action === "ok" && pending.kind === "duration") return [{ text: render.durationConfirmed(pending.minutes) }];
    return [{ text: render.expiredAction() }];
  }
  if (cb.action === "no") {
    await saveState(ctx, { pending: null });
    return [{ text: render.cancelled() }];
  }

  if (cb.action === "pick" && pending.kind === "pick" && pending.candidates[cb.index]) {
    const overrides = { ...pending.overrides, [pending.slot]: pending.candidates[cb.index].id };
    // Picking the exercise is the confirmation the parser was missing.
    return completePending(ctx, pending.id, () => execute(ctx, pending.intent, overrides, Math.max(pending.confidence, CONFIRM_BELOW), false));
  }
  if (cb.action !== "pick" && pending.kind === "confirm") {
    return completePending(ctx, pending.id, () => execute(ctx, pending.intent, pending.overrides, 1, true));
  }
  if (cb.action !== "pick" && pending.kind === "routine") return completePending(ctx, pending.id, () => saveRoutineDraft(ctx, pending.days));

  await saveState(ctx, { pending: null });
  return [{ text: render.expiredAction() }];
}

/**
 * Runs the tapped action while its step stays saved, so a failure (and the task's retry) can still find it.
 * Afterwards only that step is cleared: a new step the action asked for (another pick, the weekdays) is kept.
 */
async function completePending(ctx: Ctx, id: string, action: () => Promise<Out[]>): Promise<Out[]> {
  const outs = await action();
  if (ctx.state.pending?.id === id) await saveState(ctx, { pending: null });
  return outs;
}
