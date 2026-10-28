"use server";

import { clerkClient } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db, users } from "@/db";
import { currentAppUser } from "@/lib/data/load";
import { MAX_DURATION_MIN } from "@/lib/engine/duration";
import { DAY_LETTERS, MAX_PLANNED_SETS, renameExerciseForUser, saveRoutine } from "@/lib/services/routine";
import { createCheckoutUrl, createPortalUrl, deleteStripeCustomer } from "@/lib/services/billing";
import { createLinkToken, unlinkTelegram } from "@/lib/services/users";
import { deleteSetById, editSetById, setSessionDuration } from "@/lib/services/workout";

// Server Actions for the (app) pages. Each one resolves the signed-in user itself (they are reachable
// by direct POST) and validates its input with Zod. Changes that alter what the bot does (routine, reminders,
// Telegram link, account) are logged to Sentry as audit events, with the internal user id only.

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string): ActionResult<never> => ({ ok: false, error });

/**
 * Server Actions are not traced automatically: this gives each one a named span, joined to the browser
 * trace through the request headers. Form data and responses are deliberately not recorded (no PII).
 */
async function traced<T>(name: string, action: () => Promise<T>): Promise<T> {
  return Sentry.withServerActionInstrumentation(name, { headers: await headers() }, action);
}

const RoutineInput = z
  .array(
    z.object({
      title: z.string().trim().max(60),
      exercises: z
        .array(
          z.object({
            id: z.uuid(),
            plannedSets: z.number().int().min(1).max(MAX_PLANNED_SETS),
            // Only sent when the user edited the name.
            name: z.string().trim().min(1).max(80).optional(),
          }),
        )
        .max(20),
    }),
  )
  .min(1)
  .max(DAY_LETTERS.length);

/** Exercises renamed on save: old id -> the exercise the routine now points at. */
export type RenamedExercises = Record<string, { id: string; name: string }>;

export async function saveRoutineAction(input: z.input<typeof RoutineInput>): Promise<ActionResult<RenamedExercises>> {
  return traced("saveRoutineAction", async () => {
    const user = await currentAppUser();
    const parsed = RoutineInput.safeParse(input);
    if (!parsed.success) return fail("Rotina inválida. Confira os treinos e tente de novo.");
    const renamed: RenamedExercises = {};
    try {
      for (const e of parsed.data.flatMap((d) => d.exercises)) {
        if (e.name && !renamed[e.id]) renamed[e.id] = await renameExerciseForUser(user.id, e.id, e.name);
      }
      await saveRoutine(
        user.id,
        parsed.data.map((d, i) => ({
          title: d.title || `Treino ${DAY_LETTERS[i]}`,
          exercises: d.exercises.map((e) => ({ exerciseId: renamed[e.id]?.id ?? e.id, plannedSets: e.plannedSets })),
        })),
      );
    } catch (err) {
      Sentry.logger.warn("Routine save rejected", { user_id: user.id, error_type: err instanceof Error ? err.name : typeof err });
      return fail(err instanceof Error ? err.message : "Não foi possível salvar a rotina.");
    }
    Sentry.logger.info("Routine saved", {
      user_id: user.id,
      day_count: parsed.data.length,
      exercise_count: parsed.data.reduce((sum, d) => sum + d.exercises.length, 0),
      renamed_count: Object.keys(renamed).length,
      source: "web",
    });
    refresh();
    return { ok: true, data: renamed };
  });
}

const DurationInput = z.object({ sessionId: z.uuid(), minutes: z.number().int().min(1).max(MAX_DURATION_MIN) });

export async function updateSessionDurationAction(input: z.input<typeof DurationInput>): Promise<ActionResult> {
  return traced("updateSessionDurationAction", async () => {
    const user = await currentAppUser();
    const parsed = DurationInput.safeParse(input);
    if (!parsed.success) return fail("Duração inválida. Use entre 1 e 600 minutos.");
    if (!(await setSessionDuration(user.id, parsed.data.sessionId, parsed.data.minutes))) return fail("Treino não encontrado.");
    Sentry.logger.info("Session duration edited", { user_id: user.id, minutes: parsed.data.minutes, source: "web" });
    refresh();
    return { ok: true, data: undefined };
  });
}

const SetEditInput = z.object({ setId: z.uuid(), weight: z.number().min(0).max(1000), reps: z.number().int().min(1).max(100) });

export async function updateSetAction(input: z.input<typeof SetEditInput>): Promise<ActionResult> {
  return traced("updateSetAction", async () => {
    const user = await currentAppUser();
    const parsed = SetEditInput.safeParse(input);
    if (!parsed.success) return fail("Valores inválidos. Carga até 1000 kg e de 1 a 100 repetições.");
    const { setId, weight, reps } = parsed.data;
    if (!(await editSetById(user, setId, { weight, reps }))) return fail("Série não encontrada.");
    Sentry.logger.info("Set edited", { user_id: user.id, source: "web" });
    refresh();
    return { ok: true, data: undefined };
  });
}

export async function deleteSetAction(input: { setId: string }): Promise<ActionResult<{ sessionEmpty: boolean }>> {
  return traced("deleteSetAction", async () => {
    const user = await currentAppUser();
    const parsed = z.object({ setId: z.uuid() }).safeParse(input);
    if (!parsed.success) return fail("Série inválida.");
    const result = await deleteSetById(user, parsed.data.setId);
    if (!result) return fail("Série não encontrada.");
    Sentry.logger.info("Set deleted", { user_id: user.id, source: "web" });
    refresh();
    return { ok: true, data: result };
  });
}

const SettingsInput = z.object({
  timezone: z.string().refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz) || tz === "UTC", "Fuso inválido"),
  reminderTime: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]),
  trainingDays: z.array(z.number().int().min(1).max(7)).max(7),
  weightIncrementKg: z.number().min(0.25).max(10),
});

export async function saveSettingsAction(input: z.input<typeof SettingsInput>): Promise<ActionResult> {
  return traced("saveSettingsAction", async () => {
    const user = await currentAppUser();
    const parsed = SettingsInput.safeParse(input);
    if (!parsed.success) return fail("Preferências inválidas.");
    const { timezone, reminderTime, trainingDays, weightIncrementKg } = parsed.data;
    // Targets already in set_targets keep their loads; the new increment applies from the next load-up.
    await db
      .update(users)
      .set({ timezone, reminderTime: reminderTime || null, trainingDays: [...new Set(trainingDays)].sort(), weightIncrementKg })
      .where(eq(users.id, user.id));
    // Answers "why didn't my reminder arrive?": the reminder setup in effect and when it changed.
    Sentry.logger.info("Settings saved", {
      user_id: user.id,
      timezone,
      reminder_enabled: Boolean(reminderTime),
      ...(reminderTime && { reminder_time: reminderTime }),
      training_day_count: new Set(trainingDays).size,
      weight_increment_kg: weightIncrementKg,
    });
    refresh();
    return { ok: true, data: undefined };
  });
}

/** Single-use deep link that opens the bot and links the chat (valid for 15 minutes). */
export async function createTelegramLinkAction(): Promise<ActionResult<{ url: string }>> {
  return traced("createTelegramLinkAction", async () => {
    const user = await currentAppUser();
    const bot = process.env.TELEGRAM_BOT_USERNAME;
    if (!bot) return fail("Bot do Telegram não configurado.");
    const token = await createLinkToken(user.id);
    return { ok: true, data: { url: `https://t.me/${bot.replace(/^@/, "")}?start=${token}` } };
  });
}

export async function disconnectTelegramAction(): Promise<ActionResult> {
  return traced("disconnectTelegramAction", async () => {
    const user = await currentAppUser();
    await unlinkTelegram(user.id);
    Sentry.logger.info("Telegram unlinked", { user_id: user.id });
    refresh();
    return { ok: true, data: undefined };
  });
}

const CheckoutInput = z.object({ plan: z.enum(["monthly", "annual"]) });

/** Stripe Checkout (free trial included) for the chosen plan; the client redirects to the returned URL. */
export async function startCheckoutAction(input: z.input<typeof CheckoutInput>): Promise<ActionResult<{ url: string }>> {
  return traced("startCheckoutAction", async () => {
    const user = await currentAppUser();
    const parsed = CheckoutInput.safeParse(input);
    if (!parsed.success) return fail("Plano inválido.");
    try {
      const url = await createCheckoutUrl(user, parsed.data.plan);
      Sentry.logger.info("Checkout started", { user_id: user.id, plan: parsed.data.plan });
      return { ok: true, data: { url } };
    } catch (err) {
      Sentry.captureException(err, { tags: { action: "start_checkout" } });
      return fail("Não foi possível abrir o pagamento. Tente de novo.");
    }
  });
}

/** Stripe Customer Portal: cancel, switch plan, update the card, invoices. */
export async function openBillingPortalAction(): Promise<ActionResult<{ url: string }>> {
  return traced("openBillingPortalAction", async () => {
    const user = await currentAppUser();
    try {
      return { ok: true, data: { url: await createPortalUrl(user) } };
    } catch (err) {
      Sentry.captureException(err, { tags: { action: "open_billing_portal" } });
      return fail("Não foi possível abrir o gerenciamento da assinatura. Tente de novo.");
    }
  });
}

/** Hard delete: every user table cascades from `users`; then the Clerk account goes too. */
export async function deleteAccountAction(): Promise<ActionResult> {
  return traced("deleteAccountAction", async () => {
    const user = await currentAppUser();
    // Billing first: if Stripe fails, nothing was deleted yet and the user can retry.
    try {
      await deleteStripeCustomer(user);
    } catch (err) {
      Sentry.captureException(err, { tags: { action: "delete_account_billing" } });
      return fail("Não conseguimos cancelar sua assinatura. Tente de novo.");
    }
    await db.delete(users).where(eq(users.id, user.id));
    try {
      const clerk = await clerkClient();
      await clerk.users.deleteUser(user.clerkId);
    } catch (err) {
      // The data is gone but the login remains: an orphaned Clerk account that needs attention.
      Sentry.captureException(err, { tags: { action: "delete_account" } });
      return fail("Seus dados foram apagados, mas não conseguimos remover o login. Tente de novo.");
    }
    Sentry.logger.info("Account deleted", { user_id: user.id });
    return { ok: true, data: undefined };
  });
}
