import type { MuscleGroup } from "@/db/schema";

// View models consumed by the (app) pages, built from Drizzle queries in ./load.ts.

export type DayLetter = "A" | "B" | "C" | "D" | "E";

export type ExerciseRef = { id: string; name: string; muscleGroup: MuscleGroup };

export type SetTarget = { position: number; weight: number; reps: number };

export type RoutineExercise = ExerciseRef & { plannedSets: number; targets: SetTarget[] };

export type RoutineDay = { letter: DayLetter; title: string; exercises: RoutineExercise[] };

export type Routine = { days: RoutineDay[]; nextLetter: DayLetter };

export type LoggedSet = {
  id: string;
  position: number;
  weight: number;
  reps: number;
  isExtra: boolean;
  isPr: boolean;
  corrected: boolean;
};

export type SessionExercise = ExerciseRef & { sets: LoggedSet[] };

export type CloseReason = "user" | "complete" | "inactive";

export type WorkoutSession = {
  id: string;
  letter: DayLetter;
  title: string;
  startedAt: string; // ISO
  endedAt: string; // ISO
  closeReason: CloseReason;
  exercises: SessionExercise[];
  calories: number; // estimated kcal, from Σ weight × reps
  setCount: number;
  prCount: number;
};

export type ExercisePoint = {
  date: string; // ISO
  maxWeight: number;
  maxWeightReps: number; // reps done at maxWeight (best of ties)
  bestE1rm: number;
  calories: number;
};

export type ExerciseSummary = ExerciseRef & {
  currentWeight: number;
  weightChange30d: number;
  trend: number[];
  stagnant: boolean;
  lastTrainedAt: string;
};

export type PersonalRecord = ExerciseRef & { weight: number; reps: number; date: string };

export type Settings = {
  telegram: { connected: boolean; username: string | null; linkedAt: string | null };
  timezone: string;
  reminderTime: string; // HH:mm
  trainingDays: number[]; // ISO weekdays, 1 = Monday
  weightIncrementKg: number;
  usage: { today: number; limit: number }; // Telegram messages counted today vs the daily cap
  billing: Billing;
};

export type Billing = {
  /** Stripe status (trialing, active, past_due, canceled, ...); null = never subscribed. */
  status: string | null;
  /** False once the subscription is over or unpaid: the page offers Checkout again. */
  hasAccess: boolean;
  /** Account from before billing launched: free access, nothing to manage in Stripe. */
  complimentary: boolean;
  plan: "monthly" | "annual" | null;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};
