-- Branch/company tenancy for Leads, Holidays and Mock exams.
--
-- These four model families had NO tenancy column at all. `Lead.getBoard()` was
-- `where: { deletedAt: null }` (every lead in the database), `Holiday` was global
-- across the whole DB while driving attendance validation and billing from ~15
-- call sites, and `MockExam.revenueSummary()` summed `paid: true` company-blind.
--
-- SAFETY. Every column is added NULLABLE first, backfilled from real data, and
-- only then constrained. `companyId` is resolved from the Company table rather
-- than hardcoded to 1001, so the migration is correct even if the id differs.
-- Nothing is deleted and no existing value is overwritten.

-- ---------------------------------------------------------------------------
-- 1. companyId — added nullable, backfilled, then NOT NULL
-- ---------------------------------------------------------------------------
ALTER TABLE "Lead"                ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "LeadColumn"          ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "LeadSection"         ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "LeadSource"          ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "Holiday"             ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "MockExamSection"     ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "MockExam"            ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "MockExamParticipant" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  target_company INTEGER;
BEGIN
  -- This is a single-company install; the lowest id is that company. If a
  -- second company ever exists at migration time, STOP rather than guess —
  -- silently assigning every lead and holiday to one of them would be wrong
  -- and unrecoverable.
  IF (SELECT COUNT(*) FROM "Company") > 1 THEN
    RAISE EXCEPTION
      'Bir nechta kompaniya topildi — tenancy backfill qo''lda bajarilishi kerak';
  END IF;

  SELECT id INTO target_company FROM "Company" ORDER BY id LIMIT 1;
  IF target_company IS NULL THEN
    RAISE EXCEPTION 'Company jadvali bo''sh — backfill qilib bo''lmaydi';
  END IF;

  UPDATE "Lead"                SET "companyId" = target_company WHERE "companyId" IS NULL;
  UPDATE "LeadColumn"          SET "companyId" = target_company WHERE "companyId" IS NULL;
  UPDATE "LeadSection"         SET "companyId" = target_company WHERE "companyId" IS NULL;
  UPDATE "LeadSource"          SET "companyId" = target_company WHERE "companyId" IS NULL;
  UPDATE "Holiday"             SET "companyId" = target_company WHERE "companyId" IS NULL;
  UPDATE "MockExamSection"     SET "companyId" = target_company WHERE "companyId" IS NULL;
  UPDATE "MockExam"            SET "companyId" = target_company WHERE "companyId" IS NULL;
  UPDATE "MockExamParticipant" SET "companyId" = target_company WHERE "companyId" IS NULL;
END $$;

ALTER TABLE "Lead"                ALTER COLUMN "companyId" SET NOT NULL, ALTER COLUMN "companyId" SET DEFAULT 1001;
ALTER TABLE "LeadColumn"          ALTER COLUMN "companyId" SET NOT NULL, ALTER COLUMN "companyId" SET DEFAULT 1001;
ALTER TABLE "LeadSection"         ALTER COLUMN "companyId" SET NOT NULL, ALTER COLUMN "companyId" SET DEFAULT 1001;
ALTER TABLE "LeadSource"          ALTER COLUMN "companyId" SET NOT NULL, ALTER COLUMN "companyId" SET DEFAULT 1001;
ALTER TABLE "Holiday"             ALTER COLUMN "companyId" SET NOT NULL, ALTER COLUMN "companyId" SET DEFAULT 1001;
ALTER TABLE "MockExamSection"     ALTER COLUMN "companyId" SET NOT NULL, ALTER COLUMN "companyId" SET DEFAULT 1001;
ALTER TABLE "MockExam"            ALTER COLUMN "companyId" SET NOT NULL, ALTER COLUMN "companyId" SET DEFAULT 1001;
ALTER TABLE "MockExamParticipant" ALTER COLUMN "companyId" SET NOT NULL, ALTER COLUMN "companyId" SET DEFAULT 1001;

-- ---------------------------------------------------------------------------
-- 2. branchId — stays NULLABLE by design
-- ---------------------------------------------------------------------------
-- Unlike Student/Group, null is a MEANINGFUL state on all three:
--   Lead     — arrived before anyone knew which branch (public form, cold call).
--              Null leads are an unassigned pool visible to every branch.
--   Holiday  — null is a COMPANY-WIDE holiday (Navro'z, Mustaqillik kuni), which
--              is what nearly every row is. Non-null is one branch closing.
--   MockExam — where the exam is held, unknown for exams created before this.
ALTER TABLE "Lead"     ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "Holiday"  ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "MockExam" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;

-- Existing leads all pre-date the second branch, so they belong to the first
-- one. Left null they would sit in the "unassigned" pool and show up on the new
-- branch's board — the exact leak this migration closes.
--
-- Holidays are deliberately NOT backfilled: every existing row is a national
-- holiday and null already means company-wide.
UPDATE "Lead"
   SET "branchId" = (SELECT MIN(id) FROM "Branch" WHERE "deletedAt" IS NULL)
 WHERE "branchId" IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Lead_companyId_idx"                ON "Lead"("companyId");
CREATE INDEX IF NOT EXISTS "Lead_branchId_idx"                 ON "Lead"("branchId");
CREATE INDEX IF NOT EXISTS "LeadColumn_companyId_idx"          ON "LeadColumn"("companyId");
CREATE INDEX IF NOT EXISTS "LeadSection_companyId_idx"         ON "LeadSection"("companyId");
CREATE INDEX IF NOT EXISTS "LeadSource_companyId_idx"          ON "LeadSource"("companyId");
CREATE INDEX IF NOT EXISTS "Holiday_companyId_idx"             ON "Holiday"("companyId");
CREATE INDEX IF NOT EXISTS "Holiday_branchId_idx"              ON "Holiday"("branchId");
CREATE INDEX IF NOT EXISTS "MockExamSection_companyId_idx"     ON "MockExamSection"("companyId");
CREATE INDEX IF NOT EXISTS "MockExam_companyId_idx"            ON "MockExam"("companyId");
CREATE INDEX IF NOT EXISTS "MockExam_branchId_idx"             ON "MockExam"("branchId");
CREATE INDEX IF NOT EXISTS "MockExamParticipant_companyId_idx" ON "MockExamParticipant"("companyId");

-- ---------------------------------------------------------------------------
-- 4. Foreign keys
-- ---------------------------------------------------------------------------
-- These columns previously had no FK, so an id that does not exist could be
-- written and would stay forever (the P105 class of defect). Branch FKs are
-- ON DELETE SET NULL: archiving a branch must not cascade-delete its leads.
ALTER TABLE "Lead"                ADD CONSTRAINT "Lead_companyId_fkey"                FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lead"                ADD CONSTRAINT "Lead_branchId_fkey"                 FOREIGN KEY ("branchId")  REFERENCES "Branch"("id")  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadColumn"          ADD CONSTRAINT "LeadColumn_companyId_fkey"          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadSection"         ADD CONSTRAINT "LeadSection_companyId_fkey"         FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadSource"          ADD CONSTRAINT "LeadSource_companyId_fkey"          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Holiday"             ADD CONSTRAINT "Holiday_companyId_fkey"             FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Holiday"             ADD CONSTRAINT "Holiday_branchId_fkey"              FOREIGN KEY ("branchId")  REFERENCES "Branch"("id")  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MockExamSection"     ADD CONSTRAINT "MockExamSection_companyId_fkey"     FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MockExam"            ADD CONSTRAINT "MockExam_companyId_fkey"            FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MockExam"            ADD CONSTRAINT "MockExam_branchId_fkey"             FOREIGN KEY ("branchId")  REFERENCES "Branch"("id")  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MockExamParticipant" ADD CONSTRAINT "MockExamParticipant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
