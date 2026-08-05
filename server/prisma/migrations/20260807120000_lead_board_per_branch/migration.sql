-- Per-branch leads board.
--
-- `LeadColumn` and `LeadSection` were company-level, so both branches shared one
-- Kanban board. The production data shows why that is wrong: sections are named
-- "A1 SPSH 15:00 Eldor" and "A1 DCHJ 10:00 Saida" — level, weekdays, hour and
-- the TEACHER. They are forming groups, and a Fargona teacher's 15:00 slot is
-- meaningless in Namangan.
--
-- The branch lives on the COLUMN. A section's branch is its column's; a lead's
-- is its section's column's. One owner rather than three copies to keep in sync.
--
-- SAFETY. Nullable first, backfilled from real data, then constrained. No row is
-- deleted and no existing value is overwritten. The only INSERTs are the system
-- column each branch structurally requires — without one, a branch's board has
-- nowhere to put a lead at all.

-- ---------------------------------------------------------------------------
-- 1. branchId — nullable
-- ---------------------------------------------------------------------------
ALTER TABLE "LeadColumn" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;

-- ---------------------------------------------------------------------------
-- 2. Backfill existing columns, then give every OTHER branch its system column
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  target_company INTEGER;
  home_branch    INTEGER;
  b              RECORD;
BEGIN
  IF (SELECT COUNT(*) FROM "Company") > 1 THEN
    RAISE EXCEPTION
      'Bir nechta kompaniya topildi — lid doskasi backfill''i qo''lda bajarilishi kerak';
  END IF;

  SELECT id INTO target_company FROM "Company" ORDER BY id LIMIT 1;
  IF target_company IS NULL THEN
    RAISE EXCEPTION 'Company jadvali bo''sh — backfill qilib bo''lmaydi';
  END IF;

  -- Every existing column belongs to the branch that has been running the
  -- board: the lowest branch id (Fargona). Its leads were already backfilled
  -- there by 20260805120000, so column and lead agree by construction.
  SELECT id INTO home_branch
  FROM "Branch"
  WHERE "companyId" = target_company AND "deletedAt" IS NULL
  ORDER BY id LIMIT 1;

  IF home_branch IS NULL THEN
    RAISE EXCEPTION 'Kompaniya % uchun filial topilmadi', target_company;
  END IF;

  UPDATE "LeadColumn" SET "branchId" = home_branch WHERE "branchId" IS NULL;

  -- Bootstrap the fixed NEW column for every other live branch. `systemKey`
  -- = 'NEW' is load-bearing: moving a lead (or a section) into that column
  -- resets the lead's funnel stage to NEW, and a branch with no column at all
  -- cannot have a section, therefore cannot hold a lead. Idempotent — skips a
  -- branch that already has one.
  FOR b IN
    SELECT id FROM "Branch"
    WHERE "companyId" = target_company
      AND "deletedAt" IS NULL
      AND id <> home_branch
  LOOP
    INSERT INTO "LeadColumn"
      ("id", "name", "order", "isSystem", "systemKey",
       "createdAt", "updatedAt", "companyId", "branchId")
    SELECT gen_random_uuid()::text, 'Yangi Lidlar', 0, true, 'NEW',
           NOW(), NOW(), target_company, b.id
    WHERE NOT EXISTS (
      SELECT 1 FROM "LeadColumn"
      WHERE "branchId" = b.id AND "systemKey" = 'NEW' AND "deletedAt" IS NULL
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Constrain
-- ---------------------------------------------------------------------------
ALTER TABLE "LeadColumn" ALTER COLUMN "branchId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "LeadColumn_branchId_idx" ON "LeadColumn"("branchId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LeadColumn_branchId_fkey'
  ) THEN
    ALTER TABLE "LeadColumn"
      ADD CONSTRAINT "LeadColumn_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Assertions — fail the migration rather than leave a half-migrated board
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  orphan_cols     INTEGER;
  branchless_new  INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_cols FROM "LeadColumn" WHERE "branchId" IS NULL;
  IF orphan_cols > 0 THEN
    RAISE EXCEPTION 'LeadColumn.branchId hali % qatorda NULL', orphan_cols;
  END IF;

  -- Every live branch must end up with exactly one usable NEW column.
  SELECT COUNT(*) INTO branchless_new
  FROM "Branch" b
  WHERE b."deletedAt" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "LeadColumn" c
      WHERE c."branchId" = b.id AND c."systemKey" = 'NEW' AND c."deletedAt" IS NULL
    );
  IF branchless_new > 0 THEN
    RAISE EXCEPTION
      '% ta filialda "Yangi Lidlar" tizim ustuni yo''q — doska ishlamaydi',
      branchless_new;
  END IF;
END $$;
