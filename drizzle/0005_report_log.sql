CREATE TABLE "report_log" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"period" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_log_user_id_kind_period_pk" PRIMARY KEY("user_id","kind","period")
);
--> statement-breakpoint
ALTER TABLE "report_log" ADD CONSTRAINT "report_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
