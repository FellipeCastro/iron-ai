CREATE TABLE "ai_usage_user" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 4) DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_user_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "cached_input_tokens" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "fallback_cost_usd" numeric(10, 4) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_user" ADD CONSTRAINT "ai_usage_user_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;