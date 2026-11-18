ALTER TABLE "set_entries" ADD COLUMN "source_update_id" bigint;--> statement-breakpoint
ALTER TABLE "set_entries" ADD COLUMN "source_idx" smallint;--> statement-breakpoint
CREATE UNIQUE INDEX "set_entries_source_uq" ON "set_entries" USING btree ("source_update_id","source_idx") WHERE "set_entries"."source_update_id" is not null;