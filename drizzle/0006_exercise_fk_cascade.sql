ALTER TABLE "routine_exercises" DROP CONSTRAINT "routine_exercises_exercise_id_exercises_id_fk";
--> statement-breakpoint
ALTER TABLE "set_entries" DROP CONSTRAINT "set_entries_exercise_id_exercises_id_fk";
--> statement-breakpoint
ALTER TABLE "set_targets" DROP CONSTRAINT "set_targets_exercise_id_exercises_id_fk";
--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_entries" ADD CONSTRAINT "set_entries_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_targets" ADD CONSTRAINT "set_targets_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;