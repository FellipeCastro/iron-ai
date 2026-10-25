"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db, users } from "@/db";
import { currentAppUser } from "@/lib/data/load";
import { DAY_LETTERS, MAX_PLANNED_SETS, saveRoutine } from "@/lib/services/routine";
import { createLinkToken, unlinkTelegram } from "@/lib/services/users";

// Server Actions for the (app) pages. Each one resolves the signed-in user itself (they are reachable
// by direct POST) and validates its input with Zod.

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string): ActionResult<never> => ({ ok: false, error });

const RoutineInput = z
  .array(
    z.object({
      title: z.string().trim().max(60),
      exercises: z.array(z.object({ id: z.uuid(), plannedSets: z.number().int().min(1).max(MAX_PLANNED_SETS) })).max(20),
    }),
  )
  .min(1)
  .max(DAY_LETTERS.length);

export async function saveRoutineAction(input: z.input<typeof RoutineInput>): Promise<ActionResult> {
  const user = await currentAppUser();
  const parsed = RoutineInput.safeParse(input);
  if (!parsed.success) return fail("Rotina inválida. Confira os treinos e tente de novo.");
  try {
    await saveRoutine(
      user.id,
      parsed.data.map((d, i) => ({
        title: d.title || `Treino ${DAY_LETTERS[i]}`,
        exercises: d.exercises.map((e) => ({ exerciseId: e.id, plannedSets: e.plannedSets })),
      })),
    );
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Não foi possível salvar a rotina.");
  }
  refresh();
  return { ok: true, data: undefined };
}

const SettingsInput = z.object({
  timezone: z.string().refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz) || tz === "UTC", "Fuso inválido"),
  reminderTime: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]),
  trainingDays: z.array(z.number().int().min(1).max(7)).max(7),
  weightIncrementKg: z.number().min(0.25).max(10),
});

export async function saveSettingsAction(input: z.input<typeof SettingsInput>): Promise<ActionResult> {
  const user = await currentAppUser();
  const parsed = SettingsInput.safeParse(input);
  if (!parsed.success) return fail("Preferências inválidas.");
  const { timezone, reminderTime, trainingDays, weightIncrementKg } = parsed.data;
  // Targets already in set_targets keep their loads; the new increment applies from the next load-up.
  await db
    .update(users)
    .set({ timezone, reminderTime: reminderTime || null, trainingDays: [...new Set(trainingDays)].sort(), weightIncrementKg })
    .where(eq(users.id, user.id));
  refresh();
  return { ok: true, data: undefined };
}

/** Single-use deep link that opens the bot and links the chat (valid for 15 minutes). */
export async function createTelegramLinkAction(): Promise<ActionResult<{ url: string }>> {
  const user = await currentAppUser();
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  if (!bot) return fail("Bot do Telegram não configurado.");
  const token = await createLinkToken(user.id);
  return { ok: true, data: { url: `https://t.me/${bot.replace(/^@/, "")}?start=${token}` } };
}

export async function disconnectTelegramAction(): Promise<ActionResult> {
  const user = await currentAppUser();
  await unlinkTelegram(user.id);
  refresh();
  return { ok: true, data: undefined };
}

/** Hard delete: every user table cascades from `users`; then the Clerk account goes too. */
export async function deleteAccountAction(): Promise<ActionResult> {
  const user = await currentAppUser();
  await db.delete(users).where(eq(users.id, user.id));
  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(user.clerkId);
  } catch (err) {
    console.error("Clerk deleteUser failed", err);
    return fail("Seus dados foram apagados, mas não conseguimos remover o login. Tente de novo.");
  }
  return { ok: true, data: undefined };
}
