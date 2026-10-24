import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// Weights in kg with 0.25 kg precision (e.g. 1.25 kg plates).
const kg = (name: string) => numeric(name, { precision: 6, scale: 2, mode: "number" });

export const muscleGroup = pgEnum("muscle_group", [
  "peito",
  "costas",
  "ombros",
  "biceps",
  "triceps",
  "antebraco",
  "trapezio",
  "quadriceps",
  "posterior",
  "gluteos",
  "adutores",
  "abdutores",
  "panturrilha",
  "abdomen",
  "lombar",
]);

export const sessionCloseReason = pgEnum("session_close_reason", ["user", "complete", "inactive"]);

export const messageStatus = pgEnum("message_status", ["received", "processed", "clarify", "ignored", "failed"]);

// ---------- Users & Telegram link ----------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").notNull().unique(),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  reminderTime: time("reminder_time"),
  // ISO weekdays: 1 = Monday … 7 = Sunday.
  trainingDays: smallint("training_days").array().notNull().default(sql`'{}'::smallint[]`),
  weightIncrementKg: kg("weight_increment_kg").notNull().default(2.5),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const telegramLinks = pgTable("telegram_links", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  chatId: bigint("chat_id", { mode: "number" }).notNull().unique(),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
});

export const linkTokens = pgTable(
  "link_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // SHA-256 of the token sent in the deep link; the raw token is never stored.
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("link_tokens_user_idx").on(t.userId)],
);

// ---------- Exercise catalog ----------

export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    muscleGroup: muscleGroup("muscle_group").notNull(),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    // null = global catalog; set = custom exercise created by that user.
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("exercises_catalog_name_uq").on(t.name).where(sql`${t.ownerUserId} is null`),
    unique("exercises_owner_name_uq").on(t.ownerUserId, t.name),
    index("exercises_aliases_gin").using("gin", t.aliases),
  ],
);

// ---------- Routine (versioned) ----------

export const routines = pgTable(
  "routines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("routines_user_version_uq").on(t.userId, t.version)],
);

export const routineDays = pgTable(
  "routine_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routineId: uuid("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    letter: text("letter").notNull(),
    position: smallint("position").notNull(),
  },
  (t) => [
    unique("routine_days_letter_uq").on(t.routineId, t.letter),
    unique("routine_days_position_uq").on(t.routineId, t.position),
  ],
);

export const routineExercises = pgTable(
  "routine_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dayId: uuid("day_id")
      .notNull()
      .references(() => routineDays.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    order: smallint("order").notNull(),
    plannedSets: smallint("planned_sets").notNull(),
  },
  (t) => [unique("routine_exercises_order_uq").on(t.dayId, t.order)],
);

// ---------- Workout log ----------

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dayId: uuid("day_id").references(() => routineDays.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    closeReason: sessionCloseReason("close_reason"),
    lastSetAt: timestamp("last_set_at", { withTimezone: true }),
    summarySentAt: timestamp("summary_sent_at", { withTimezone: true }),
  },
  (t) => [
    // At most one open session per user.
    uniqueIndex("sessions_one_open_uq").on(t.userId).where(sql`${t.endedAt} is null`),
    index("sessions_user_started_idx").on(t.userId, t.startedAt),
    // Inactivity sweep by the 5-min cron.
    index("sessions_open_last_set_idx").on(t.lastSetAt).where(sql`${t.endedAt} is null`),
  ],
);

// Append-only: corrections insert a new row pointing to the old one via `supersedes_id`.
export const setEntries = pgTable(
  "set_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    setPosition: smallint("set_position").notNull(),
    weight: kg("weight").notNull(),
    reps: smallint("reps").notNull(),
    isExtra: boolean("is_extra").notNull().default(false),
    supersedesId: uuid("supersedes_id").references((): AnyPgColumn => setEntries.id, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("set_entries_session_idx").on(t.sessionId),
    index("set_entries_exercise_idx").on(t.exerciseId, t.createdAt),
  ],
);

// Current target per set position; derived from the log and recomputable.
export const setTargets = pgTable(
  "set_targets",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    setPosition: smallint("set_position").notNull(),
    weight: kg("weight").notNull(),
    reps: smallint("reps").notNull(),
    sourceEntryId: uuid("source_entry_id").references(() => setEntries.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.exerciseId, t.setPosition] })],
);

// ---------- Telegram messages & operational ----------

// Raw text is purged after 30 days.
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    updateId: bigint("update_id", { mode: "number" }).notNull().unique(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    rawText: text("raw_text"),
    parsedJson: jsonb("parsed_json"),
    status: messageStatus("status").notNull().default("received"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_created_idx").on(t.createdAt)],
);

export const reminderLog = pgTable(
  "reminder_log",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const usageCounters = pgTable(
  "usage_counters",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

// ---------- Relations (for db.query.*) ----------

export const usersRelations = relations(users, ({ one, many }) => ({
  telegramLink: one(telegramLinks),
  routines: many(routines),
  sessions: many(sessions),
  customExercises: many(exercises),
}));

export const telegramLinksRelations = relations(telegramLinks, ({ one }) => ({
  user: one(users, { fields: [telegramLinks.userId], references: [users.id] }),
}));

export const exercisesRelations = relations(exercises, ({ one }) => ({
  owner: one(users, { fields: [exercises.ownerUserId], references: [users.id] }),
}));

export const routinesRelations = relations(routines, ({ one, many }) => ({
  user: one(users, { fields: [routines.userId], references: [users.id] }),
  days: many(routineDays),
}));

export const routineDaysRelations = relations(routineDays, ({ one, many }) => ({
  routine: one(routines, { fields: [routineDays.routineId], references: [routines.id] }),
  exercises: many(routineExercises),
}));

export const routineExercisesRelations = relations(routineExercises, ({ one }) => ({
  day: one(routineDays, { fields: [routineExercises.dayId], references: [routineDays.id] }),
  exercise: one(exercises, { fields: [routineExercises.exerciseId], references: [exercises.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  day: one(routineDays, { fields: [sessions.dayId], references: [routineDays.id] }),
  sets: many(setEntries),
}));

export const setEntriesRelations = relations(setEntries, ({ one }) => ({
  session: one(sessions, { fields: [setEntries.sessionId], references: [sessions.id] }),
  exercise: one(exercises, { fields: [setEntries.exerciseId], references: [exercises.id] }),
}));

export type User = typeof users.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SetEntry = typeof setEntries.$inferSelect;
export type MuscleGroup = (typeof muscleGroup.enumValues)[number];
