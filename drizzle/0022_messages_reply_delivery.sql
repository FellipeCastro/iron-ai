ALTER TABLE "messages" ADD COLUMN "replies" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "replies_sent" integer DEFAULT 0 NOT NULL;