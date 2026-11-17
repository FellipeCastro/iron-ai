import "../env";
import { sql } from "drizzle-orm";
import { db, exercises } from "../client";
import { catalog } from "./exercises";

async function main() {
  const rows = await db
    .insert(exercises)
    .values(catalog)
    .onConflictDoUpdate({
      target: exercises.name,
      targetWhere: sql`${exercises.ownerUserId} is null`,
      set: {
        muscleGroup: sql`excluded.muscle_group`,
        aliases: sql`excluded.aliases`,
      },
    })
    .returning({ id: exercises.id });

  console.log(`Catalog seeded: ${rows.length} exercises upserted.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
