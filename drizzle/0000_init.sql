CREATE TYPE "public"."message_status" AS ENUM('received', 'processed', 'clarify', 'ignored', 'failed');--> statement-breakpoint
CREATE TYPE "public"."muscle_group" AS ENUM('peito', 'costas', 'ombros', 'biceps', 'triceps', 'antebraco', 'trapezio', 'quadriceps', 'posterior', 'gluteos', 'adutores', 'abdutores', 'panturrilha', 'abdomen', 'lombar');--> statement-breakpoint
CREATE TYPE "public"."session_close_reason" AS ENUM('user', 'complete', 'inactive');--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"muscle_group" "muscle_group" NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_owner_name_uq" UNIQUE("owner_user_id","name")
);
--> statement-breakpoint
CREATE TABLE "link_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "link_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"update_id" bigint NOT NULL,
	"user_id" uuid,
	"raw_text" text,
	"parsed_json" jsonb,
	"status" "message_status" DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_update_id_unique" UNIQUE("update_id")
);
--> statement-breakpoint
CREATE TABLE "reminder_log" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_log_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "routine_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routine_id" uuid NOT NULL,
	"letter" text NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "routine_days_letter_uq" UNIQUE("routine_id","letter"),
	CONSTRAINT "routine_days_position_uq" UNIQUE("routine_id","position")
);
--> statement-breakpoint
CREATE TABLE "routine_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"order" smallint NOT NULL,
	"planned_sets" smallint NOT NULL,
	CONSTRAINT "routine_exercises_order_uq" UNIQUE("day_id","order")
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routines_user_version_uq" UNIQUE("user_id","version")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"close_reason" "session_close_reason",
	"last_set_at" timestamp with time zone,
	"summary_sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "set_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"set_position" smallint NOT NULL,
	"weight" numeric(6, 2) NOT NULL,
	"reps" smallint NOT NULL,
	"is_extra" boolean DEFAULT false NOT NULL,
	"supersedes_id" uuid,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_targets" (
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"set_position" smallint NOT NULL,
	"weight" numeric(6, 2) NOT NULL,
	"reps" smallint NOT NULL,
	"source_entry_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "set_targets_user_id_exercise_id_set_position_pk" PRIMARY KEY("user_id","exercise_id","set_position")
);
--> statement-breakpoint
CREATE TABLE "telegram_links" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_links_chat_id_unique" UNIQUE("chat_id")
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counters_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"reminder_time" time,
	"training_days" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	"weight_increment_kg" numeric(6, 2) DEFAULT 2.5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_tokens" ADD CONSTRAINT "link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_days" ADD CONSTRAINT "routine_days_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_day_id_routine_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."routine_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_day_id_routine_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."routine_days"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_entries" ADD CONSTRAINT "set_entries_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_entries" ADD CONSTRAINT "set_entries_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_entries" ADD CONSTRAINT "set_entries_supersedes_id_set_entries_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."set_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_targets" ADD CONSTRAINT "set_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_targets" ADD CONSTRAINT "set_targets_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_targets" ADD CONSTRAINT "set_targets_source_entry_id_set_entries_id_fk" FOREIGN KEY ("source_entry_id") REFERENCES "public"."set_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_catalog_name_uq" ON "exercises" USING btree ("name") WHERE "exercises"."owner_user_id" is null;--> statement-breakpoint
CREATE INDEX "exercises_aliases_gin" ON "exercises" USING gin ("aliases");--> statement-breakpoint
CREATE INDEX "link_tokens_user_idx" ON "link_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_created_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_one_open_uq" ON "sessions" USING btree ("user_id") WHERE "sessions"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "sessions_user_started_idx" ON "sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "sessions_open_last_set_idx" ON "sessions" USING btree ("last_set_at") WHERE "sessions"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "set_entries_session_idx" ON "set_entries" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "set_entries_exercise_idx" ON "set_entries" USING btree ("exercise_id","created_at");