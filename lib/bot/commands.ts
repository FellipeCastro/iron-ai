import { chosenLetter, type Ctx } from "@/lib/bot/context";
import type { Out } from "@/lib/bot/deliver";
import { finishWorkout } from "@/lib/bot/intents";
import * as reports from "@/lib/services/reports";
import * as render from "@/lib/telegram/render";

// Slash commands (/start, /ajuda, /treino, /terminei, /semana). They never reach the model: null means the text is
// not a command and goes on to be parsed as a normal message.

export async function handleCommand(ctx: Ctx, text: string): Promise<Out[] | null> {
  const command = text.match(/^\/(\w+)/)?.[1]?.toLowerCase();
  switch (command) {
    case undefined:
      return null;
    case "start":
      return [{ text: ctx.routine ? render.help() : render.onboardingPrompt() }];
    case "ajuda":
    case "help":
      return [{ text: render.help() }];
    case "treino":
      return [{ text: await reports.nextWorkoutText(ctx.user, ctx.routine, chosenLetter(ctx)) }];
    case "terminei":
      return finishWorkout(ctx);
    case "semana":
    case "relatorio":
      return [{ text: await reports.weekReportText(ctx.user) }];
    default:
      return [{ text: render.help() }];
  }
}
