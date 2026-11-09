ALTER TABLE "subscriptions" ADD COLUMN "cancel_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "commitment_end" timestamp with time zone;