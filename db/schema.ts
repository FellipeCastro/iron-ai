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

// "admitting": claimed by the webhook, quota decision not committed yet. The worker only runs on "received".
export const messageStatus = pgEnum("message_status", ["admitting", "received", "processed", "clarify", "ignored", "failed"]);

// ---------- Users & Telegram link ----------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").notNull().unique(),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  reminderTime: time("reminder_time"),
  // ISO weekdays: 1 = Monday … 7 = Sunday.
  trainingDays: smallint("training_days").array().notNull().default(sql`'{}'::smallint[]`),
  weightIncrementKg: kg("weight_increment_kg").notNull().default(2.5),
  // Set the first time the user opens Checkout; webhooks map Stripe events back to the user through it.
  stripeCustomerId: text("stripe_customer_id").unique(),
  // Free access without a subscription: granted to every account that existed before billing launched (migration 0004).
  complimentary: boolean("complimentary").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}).enableRLS();

// Local copy of the user's Stripe subscription, rewritten from Stripe on every subscription event.
// One row per user: a new subscription replaces a finished one (see syncSubscription).
export const subscriptions = pgTable("subscriptions", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
  // Stripe's status string: trialing, active, past_due, canceled, unpaid, incomplete, ...
  status: text("status").notNull(),
  priceId: text("price_id").notNull(),
  // Start of the current period. On a failed renewal Stripe has already moved the period forward, so for past_due
  // this is when the unpaid period began: the past_due grace counts from here. Null on rows synced before it existed.
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  trialEnd: timestamp("trial_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  // Version stamp of the snapshot saved here: it only ever grows (each write is strictly greater than the one it
  // replaces), and syncSubscription writes only if the stamp is still the one it read before asking Stripe.
  // Null on rows saved before this column existed.
  syncedFrom: timestamp("synced_from", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}).enableRLS();

// Stripe webhook events already accepted. The webhook claims the event id here BEFORE doing anything; a redelivery
// (or a concurrent second delivery) loses the primary key race and is acknowledged without any effect.
// `processedAt` is set by the worker once the event's work is done. Purged after 90 days (Stripe retries for 3).
export const stripeEvents = pgTable("stripe_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  // Set once Sentry has acknowledged the owner alert for this event (null = not delivered yet). The worker retries an
  // event until `processedAt` is saved, so this durable mark (not the retry) decides whether the alert still has to go out.
  alertedAt: timestamp("alerted_at", { withTimezone: true }),
}).enableRLS();

// Client-supplied idempotency keys (UUID v4) for operations that open a payment (lib/idempotency.ts). The key is
// claimed BEFORE the operation runs (`response` null = in progress), so a concurrent repeat waits for the first one
// instead of running it again; a repeat after it finished gets the saved response. A failed operation releases its
// claim so it can be retried with the same key. Scoped per user, so one user's key never matches another's.
// Purged after a day.
export const idempotentRequests = pgTable(
  "idempotent_requests",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    key: uuid("key").notNull(),
    // What the request asked for, so the same key with different parameters is refused instead of replayed.
    fingerprint: text("fingerprint").notNull(),
    response: jsonb("response"),
    // Names the request that currently owns the claim. A takeover replaces it, so a request that lost its claim
    // (stale, but still alive) cannot delete or overwrite the replacement's claim.
    claimToken: uuid("claim_token").notNull().defaultRandom(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.scope, t.key] }), index("idempotent_requests_created_idx").on(t.createdAt)],
).enableRLS();

// One row per user that serializes opening Stripe Checkout (lib/services/billing.ts), whatever idempotency key each
// request carries (two tabs, a fresh key after an expired one). A request holds the short lease (`leaseToken`) while it
// lists, expires and creates Sessions; the others wait. `generation` IS the Stripe idempotency key of the create, so
// even a request that outlived its lease and a takeover share one key: Stripe opens at most one Session per
// generation. It only advances once every open Session was confirmed closed. `sessionId` is the Session opened (or
// reused) under the current generation: when set, the next attempt advances before creating. Server-only.
export const checkoutSlots = pgTable("checkout_slots", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  generation: integer("generation").notNull().default(0),
  sessionId: text("session_id"),
  leaseToken: uuid("lease_token"),
  leasedAt: timestamp("leased_at", { withTimezone: true }),
}).enableRLS();

// A duplicate live subscription being cancelled and refunded (lib/subscription-sync.ts cancelDuplicateSubscriptions).
// Recorded before the cancel, so a retry still finishes the refund and sync after the subscription stopped being
// live. `operationId` (the Stripe event that recorded it) builds the Stripe idempotency keys and owns the owner alert;
// `completedAt` null = refund or sync still owed. Server-only, like stripe_events.
export const duplicateCleanups = pgTable(
  "duplicate_cleanups",
  {
    subscriptionId: text("subscription_id").primaryKey(),
    customerId: text("customer_id").notNull(),
    keptSubscriptionId: text("kept_subscription_id").notNull(),
    operationId: text("operation_id").notNull(),
    refundedAmount: integer("refunded_amount"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("duplicate_cleanups_customer_idx").on(t.customerId), index("duplicate_cleanups_operation_idx").on(t.operationId)],
).enableRLS();

export const telegramLinks = pgTable("telegram_links", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  chatId: bigint("chat_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  // Conversation state between messages (pending confirmations, routine draft). See lib/telegram/state.ts.
  chatState: jsonb("chat_state"),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

export const routineDays = pgTable(
  "routine_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routineId: uuid("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    letter: text("letter").notNull(),
    title: text("title").notNull().default(""),
    position: smallint("position").notNull(),
  },
  (t) => [
    unique("routine_days_letter_uq").on(t.routineId, t.letter),
    unique("routine_days_position_uq").on(t.routineId, t.position),
  ],
).enableRLS();

export const routineExercises = pgTable(
  "routine_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dayId: uuid("day_id")
      .notNull()
      .references(() => routineDays.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    order: smallint("order").notNull(),
    plannedSets: smallint("planned_sets").notNull(),
  },
  (t) => [unique("routine_exercises_order_uq").on(t.dayId, t.order)],
).enableRLS();

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
).enableRLS();

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
      .references(() => exercises.id, { onDelete: "cascade" }),
    setPosition: smallint("set_position").notNull(),
    weight: kg("weight").notNull(),
    reps: smallint("reps").notNull(),
    isExtra: boolean("is_extra").notNull().default(false),
    supersedesId: uuid("supersedes_id").references((): AnyPgColumn => setEntries.id, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    // Bot only: the Telegram update (and the position inside it) that produced this row. A retried update
    // cannot insert it again. Null for sets logged from the site.
    sourceUpdateId: bigint("source_update_id", { mode: "number" }),
    sourceIdx: smallint("source_idx"),
    createdAt: createdAt(),
  },
  (t) => [
    index("set_entries_session_idx").on(t.sessionId),
    uniqueIndex("set_entries_source_uq").on(t.sourceUpdateId, t.sourceIdx).where(sql`${t.sourceUpdateId} is not null`),
    index("set_entries_exercise_idx").on(t.exerciseId, t.createdAt),
    // A set can be corrected only once: two concurrent corrections of the same row cannot both insert a replacement.
    uniqueIndex("set_entries_supersedes_uq").on(t.supersedesId).where(sql`${t.supersedesId} is not null`),
  ],
).enableRLS();

// Durable evidence that a Telegram update already wrote its sets. Inserted in the same transaction as the sets but
// kept outside the session, so deleting a set (or its emptied session, which cascades to set_entries) cannot make the
// update look unapplied. `finalized_at` null = the sets are in but the follow-up work (target rebuild) is unfinished;
// `exercise_ids` is the state a retry needs to resume it. Sets stay immutable: nothing here rewrites them.
// Server-only (no app_runtime access).
export const appliedUpdates = pgTable("applied_updates", {
  updateId: bigint("update_id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Informational, deliberately not a FK: the session may be deleted while the evidence must survive.
  sessionId: uuid("session_id"),
  exerciseIds: uuid("exercise_ids").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
}).enableRLS();

// Current target per set position; derived from the log and recomputable.
export const setTargets = pgTable(
  "set_targets",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
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
).enableRLS();

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
    // The replies decided for this update, saved with its final status, and how many reached the chat. A retry of a
    // run that failed mid-delivery resumes from `repliesSent` instead of parsing and executing the update again.
    replies: jsonb("replies"),
    repliesSent: integer("replies_sent").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("messages_created_idx").on(t.createdAt)],
).enableRLS();

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
).enableRLS();

// One row per automatic report sent (or deliberately skipped): the claim that keeps a rerun from sending it twice.
// `period` is the first local date of the reported period.
export const reportLog = pgTable(
  "report_log",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["week", "month"] }).notNull(),
    period: date("period").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.period] })],
).enableRLS();

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
).enableRLS();

// Global (all users) OpenAI usage per UTC day, for the spend ceiling.
export const aiUsage = pgTable("ai_usage", {
  date: date("date").primaryKey(),
  requests: integer("requests").notNull().default(0),
  inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
  cachedInputTokens: bigint("cached_input_tokens", { mode: "number" }).notNull().default(0),
  outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4, mode: "number" }).notNull().default(0),
  // Share of costUsd spent on the fallback model, capped separately so an outage cannot burn the budget.
  fallbackCostUsd: numeric("fallback_cost_usd", { precision: 10, scale: 4, mode: "number" }).notNull().default(0),
  alertedAt: timestamp("alerted_at", { withTimezone: true }),
}).enableRLS();

// OpenAI spend per user and UTC day, for the per-user ceiling.
export const aiUsageUser = pgTable(
  "ai_usage_user",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    requests: integer("requests").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 4, mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
).enableRLS();

// A held slice of the daily OpenAI ceilings (see lib/limits.ts). Persisted so a release that failed can be retried
// later: closedAt is set exactly once, by whichever of release/settle claims it first, so the hold is given back
// at most once. Server-only (no app_runtime access).
// userId is deliberately NOT a foreign key: deleting a user must not cascade away an open hold, or the amount it
// reserved in ai_usage could never be given back. The release only needs date/usd/fallbackUsd (the per-user row
// is gone with the user), and settled holds (closedAt set) are already accounted for in ai_usage.
export const aiReservations = pgTable(
  "ai_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    date: date("date").notNull(),
    usd: numeric("usd", { precision: 10, scale: 4, mode: "number" }).notNull(),
    fallbackUsd: numeric("fallback_usd", { precision: 10, scale: 4, mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("ai_reservations_open_idx").on(t.createdAt).where(sql`${t.closedAt} is null`)],
).enableRLS();

// ---------- Relations (for db.query.*) ----------

export const usersRelations = relations(users, ({ one, many }) => ({
  telegramLink: one(telegramLinks),
  subscription: one(subscriptions),
  routines: many(routines),
  sessions: many(sessions),
  customExercises: many(exercises),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
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
export type Subscription = typeof subscriptions.$inferSelect;
export type TelegramLink = typeof telegramLinks.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SetEntry = typeof setEntries.$inferSelect;
export type MuscleGroup = (typeof muscleGroup.enumValues)[number];
