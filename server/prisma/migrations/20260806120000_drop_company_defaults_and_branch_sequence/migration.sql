-- Two cleanups that must follow the code, not lead it.
--
-- 1. Drop the `DEFAULT 1001` that `20260805120000` put on the new tenancy
--    columns. That default was a MIGRATION convenience — it let the columns go
--    NOT NULL without a separate backfill pass. Leaving it in place hardcodes
--    one company into a multi-company schema: any future write path that
--    forgets `companyId` would silently attach its rows to company 1001 and
--    nothing would complain.
--
--    SAFETY ORDER: every write path was checked first, and the one that relied
--    on the default (`HolidaysService.create`) now sets `companyId` explicitly.
--    Dropping the default before that change would have broken holiday creation
--    with a NOT NULL violation. The columns stay NOT NULL — only the default goes.
--
-- 2. Give `Branch.id` a real sequence. It is `Int @id` with NO
--    `@default(autoincrement())`, so the application had to invent ids itself:
--    `findFirst({ orderBy: { id: 'desc' } }) + 1`. Two concurrent creates read
--    the same maximum and compute the same next id. `Branch.id` is also a GLOBAL
--    primary key while the query was scoped per company, so a second company
--    would collide by construction.
--
--    Existing ids are untouched. `setval(MAX(id), true)` means the next value is
--    MAX+1, so no existing branch can be hit.

-- ---------------------------------------------------------------------------
-- 1. DROP DEFAULT (columns remain NOT NULL)
-- ---------------------------------------------------------------------------
ALTER TABLE "Lead"                ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "LeadColumn"          ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "LeadSection"         ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "LeadSource"          ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Holiday"             ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "MockExamSection"     ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "MockExam"            ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "MockExamParticipant" ALTER COLUMN "companyId" DROP DEFAULT;

-- Fail loudly rather than leave a NULL that the NOT NULL constraint would only
-- catch on the next insert. Nothing here writes; it is an assertion.
DO $$
DECLARE
  bad INTEGER;
BEGIN
  SELECT
    (SELECT count(*) FROM "Lead"                WHERE "companyId" IS NULL) +
    (SELECT count(*) FROM "LeadColumn"          WHERE "companyId" IS NULL) +
    (SELECT count(*) FROM "LeadSection"         WHERE "companyId" IS NULL) +
    (SELECT count(*) FROM "LeadSource"          WHERE "companyId" IS NULL) +
    (SELECT count(*) FROM "Holiday"             WHERE "companyId" IS NULL) +
    (SELECT count(*) FROM "MockExamSection"     WHERE "companyId" IS NULL) +
    (SELECT count(*) FROM "MockExam"            WHERE "companyId" IS NULL) +
    (SELECT count(*) FROM "MockExamParticipant" WHERE "companyId" IS NULL)
  INTO bad;
  IF bad > 0 THEN
    RAISE EXCEPTION 'companyId IS NULL qatorlar topildi: % ta', bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Branch.id sequence
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS "Branch_id_seq" OWNED BY "Branch"."id";

-- `true` = "this value has been used", so nextval() returns MAX(id)+1.
-- COALESCE covers a fresh install with no branches yet.
SELECT setval('"Branch_id_seq"', COALESCE((SELECT MAX(id) FROM "Branch"), 0), true);

ALTER TABLE "Branch" ALTER COLUMN "id" SET DEFAULT nextval('"Branch_id_seq"');

-- Assert the sequence cannot collide with an existing branch.
DO $$
DECLARE
  next_id BIGINT;
  max_id  BIGINT;
BEGIN
  SELECT last_value + 1 INTO next_id FROM "Branch_id_seq";
  SELECT COALESCE(MAX(id), 0) INTO max_id FROM "Branch";
  IF next_id <= max_id THEN
    RAISE EXCEPTION
      'Branch_id_seq keyingi qiymati (%) mavjud MAX(id) (%) bilan to''qnashadi',
      next_id, max_id;
  END IF;
END $$;
