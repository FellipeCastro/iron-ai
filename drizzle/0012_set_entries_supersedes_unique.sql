-- Guard: refuse to create the unique index while duplicate non-null supersedes_id
-- values exist (voided rows included, since the index covers all rows).
-- Which replacement to keep, and what to do with the others, is a data policy
-- decision for a maintainer; resolve the listed groups manually, then re-run.
DO $$
DECLARE
  dup_count integer;
  dup_sample text;
BEGIN
  SELECT count(*), string_agg(supersedes_id::text, ', ')
    INTO dup_count, dup_sample
  FROM (
    SELECT supersedes_id
    FROM "set_entries"
    WHERE "supersedes_id" IS NOT NULL
    GROUP BY supersedes_id
    HAVING count(*) > 1
    LIMIT 20
  ) d;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'Cannot create set_entries_supersedes_uq: duplicate supersedes_id groups found (first %: %). Resolve them per an approved data policy before migrating.',
      dup_count, dup_sample;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "set_entries_supersedes_uq" ON "set_entries" USING btree ("supersedes_id") WHERE "set_entries"."supersedes_id" is not null;
