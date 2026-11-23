CREATE TABLE "duplicate_cleanups" (
	"subscription_id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"kept_subscription_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"refunded_amount" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "duplicate_cleanups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "duplicate_cleanups_customer_idx" ON "duplicate_cleanups" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "duplicate_cleanups_operation_idx" ON "duplicate_cleanups" USING btree ("operation_id");