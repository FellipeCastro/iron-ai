CREATE TABLE "checkout_slots" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"session_id" text,
	"lease_token" uuid,
	"leased_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "checkout_slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "checkout_slots" ADD CONSTRAINT "checkout_slots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;