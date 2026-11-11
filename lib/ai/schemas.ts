import { z } from "zod";
import { muscleGroup } from "@/db/schema";

// Structured Outputs contract between the LLM and the code. The model only *interprets* the message;
// every decision (progression, records, replies) is made by deterministic code from this object.
// Strict mode rules: every field is required (use .nullable() for "absent"), objects are closed,
// no numeric/string constraints — ranges are checked again by `validateIntent` after parsing.

const exerciseName = z
  .string()
  .describe("Exercise as the user named it. If it clearly refers to an exercise of the provided routine, use that exact routine name.");

const SetGroup = z.object({
  exercise: exerciseName,
  exercise_named: z
    .boolean()
    .describe("true when the user wrote the exercise name (even partially or misspelled). false when the message has only numbers and the exercise was inferred from the exercise in progress."),
  weight_kg: z.number().nullable().describe("Load in kg. Per-side loads stay as written. null when not said (same load / bodyweight)."),
  reps: z.number().int().describe("Repetitions per set."),
  sets: z.number().int().describe("How many sets with this exact load and reps. '3x10' = 3 sets of 10 reps. Default 1."),
});

const LogSets = z.object({
  type: z.literal("log_sets"),
  groups: z.array(SetGroup).describe("Sets performed, in the order the user said them."),
});

const CorrectSet = z.object({
  type: z.literal("correct_set"),
  exercise: exerciseName.nullable().describe("Exercise being corrected; null = the last logged set."),
  set_number: z.number().int().nullable().describe("Set number (1st, 2nd…) being corrected; null = the last one of that exercise."),
  weight_kg: z.number().nullable().describe("Corrected load; null if unchanged."),
  reps: z.number().int().nullable().describe("Corrected reps; null if unchanged."),
});

const DeleteSet = z.object({
  type: z.literal("delete_set"),
  exercise: exerciseName.nullable().describe("Exercise of the set to remove; null = the last logged set."),
  set_number: z.number().int().nullable(),
});

const FinishWorkout = z.object({ type: z.literal("finish_workout") });

const AskReport = z.object({
  type: z.literal("ask_report"),
  scope: z
    .enum(["next_workout", "last_workout", "exercise", "muscle_group", "week"])
    .describe(
      "next_workout: what to do next / targets. last_workout: summary. exercise: progress of one exercise. muscle_group: estimated calories by group. week: weekly overview.",
    ),
  exercise: exerciseName.nullable(),
  muscle_group: z.enum(muscleGroup.enumValues).nullable(),
  day: z
    .string()
    .nullable()
    .describe("Only for next_workout: the routine day the user named ('A', 'treino push', 'A push'), as written. null when they did not name one."),
});

const ChooseDay = z.object({
  type: z.literal("choose_day"),
  day: z.string().describe("Routine day the user says they will train now, as written: 'A', 'push', 'treino A push'."),
});

const RoutineExercise = z.object({
  name: exerciseName,
  sets: z.number().int().describe("Planned sets. Default 3 when not said."),
  muscle_group: z.enum(muscleGroup.enumValues).describe("Main muscle group, used only if the exercise is not in the catalog."),
});

const SetupRoutine = z.object({
  type: z.literal("setup_routine"),
  days: z
    .array(z.object({ title: z.string().describe("Short pt-BR title, e.g. 'Peito e tríceps'."), exercises: z.array(RoutineExercise) }))
    .describe("Workouts in rotation order (A, B, C…)."),
});

const Clarify = z.object({
  type: z.literal("clarify"),
  reason: z
    .enum(["missing_reps", "unknown_exercise", "ambiguous", "greeting", "off_topic", "help"])
    .describe("Why nothing can be done: data missing, unclear message, small talk, or a request for help."),
});

export const ParsedMessage = z.object({
  intent: z.discriminatedUnion("type", [LogSets, CorrectSet, DeleteSet, FinishWorkout, AskReport, ChooseDay, SetupRoutine, Clarify]),
  confidence: z.number().describe("0 to 1: how sure you are that the intent and every number are exactly what the user meant."),
});

export type ParsedMessage = z.infer<typeof ParsedMessage>;
export type Intent = ParsedMessage["intent"];
export type LogSetsIntent = z.infer<typeof LogSets>;
export type SetupRoutineIntent = z.infer<typeof SetupRoutine>;

export const MAX_SETS_PER_GROUP = 10;
const MAX_WEIGHT_KG = 1000;
const MAX_REPS = 100;

const validWeight = (w: number | null) => w === null || (w >= 0 && w <= MAX_WEIGHT_KG);
const validReps = (r: number | null) => r === null || (r >= 1 && r <= MAX_REPS);

/** Post-parse sanity checks the JSON Schema cannot express. Out-of-range values become a clarification. */
export function validateIntent(parsed: ParsedMessage): ParsedMessage {
  const { intent } = parsed;
  const clarify = (reason: "missing_reps" | "ambiguous") => ({ intent: { type: "clarify" as const, reason }, confidence: parsed.confidence });
  const confidence = Math.min(1, Math.max(0, parsed.confidence));

  switch (intent.type) {
    case "log_sets":
      if (intent.groups.length === 0) return clarify("missing_reps");
      if (intent.groups.some((g) => !validWeight(g.weight_kg) || !validReps(g.reps) || g.sets < 1 || g.sets > MAX_SETS_PER_GROUP)) {
        return clarify("ambiguous");
      }
      break;
    case "correct_set":
      if (!validWeight(intent.weight_kg) || !validReps(intent.reps) || (intent.weight_kg === null && intent.reps === null)) {
        return clarify("ambiguous");
      }
      break;
    case "setup_routine":
      if (intent.days.length === 0 || intent.days.length > 5 || intent.days.some((d) => d.exercises.length === 0)) return clarify("ambiguous");
      for (const d of intent.days) for (const e of d.exercises) e.sets = Math.min(6, Math.max(1, e.sets));
      break;
  }
  return { intent, confidence };
}
