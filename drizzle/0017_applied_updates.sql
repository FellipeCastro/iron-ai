CREATE TABLE "applied_updates" (
	"update_id" bigint PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"exercise_ids" uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "applied_updates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "applied_updates" ADD CONSTRAINT "applied_updates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Updates applied before this table existed: their sets are the only evidence left, so record them (already finalized).
INSERT INTO "applied_updates" ("update_id", "user_id", "session_id", "exercise_ids", "created_at", "finalized_at")
SELECT se.source_update_id, (array_agg(s.user_id))[1], (array_agg(se.session_id))[1], array_agg(DISTINCT se.exercise_id), min(se.created_at), now()
FROM "set_entries" se
JOIN "sessions" s ON s.id = se.session_id
WHERE se.source_update_id IS NOT NULL
GROUP BY se.source_update_id
ON CONFLICT ("update_id") DO NOTHING;
