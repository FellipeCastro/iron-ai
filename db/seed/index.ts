import "../env";
import { sql } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../schema";
import { exercises } from "../schema";
import { catalog } from "./exercises";

// Catalog rows are global (owner_user_id is null), which the runtime role can't write under RLS.
// Seed as the owner role, falling back to DATABASE_URL when DATABASE_URL_OWNER isn't set
// (same rule as drizzle.config.ts).
const url = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL_OWNER or DATABASE_URL must be set");
}
const db = drizzle({ client: neon(url), schema });

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
