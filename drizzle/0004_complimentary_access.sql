ALTER TABLE "users" ADD COLUMN "complimentary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Accounts that exist when billing launches keep free access.
UPDATE "users" SET "complimentary" = true;
