-- DailyFinancialSnapshot: branch dimension + the expectation figures.
--
-- The branch rows are written from the start even though nothing reads them
-- yet: a snapshot is the one thing here that cannot be reconstructed later, so
-- adding the dimension after the fact would leave the past permanently blank.

ALTER TABLE "DailyFinancialSnapshot" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE "DailyFinancialSnapshot" ADD COLUMN IF NOT EXISTS "expectedValue" INTEGER;
ALTER TABLE "DailyFinancialSnapshot" ADD COLUMN IF NOT EXISTS "lessonsHeldValue" INTEGER;
ALTER TABLE "DailyFinancialSnapshot" ADD COLUMN IF NOT EXISTS "collectedForMonth" INTEGER;

-- Existing rows are company-wide by definition; branchId NULL already says so.
DROP INDEX IF EXISTS "DailyFinancialSnapshot_companyId_date_key";

CREATE UNIQUE INDEX IF NOT EXISTS "DailyFinancialSnapshot_companyId_branchId_date_key"
  ON "DailyFinancialSnapshot" ("companyId", "branchId", "date");

-- Postgres treats NULLs in a UNIQUE index as distinct, so the index above does
-- NOT prevent a second company-wide row for the same day. This partial index
-- does. Same pattern as tx_consumption_per_attendance_unique.
CREATE UNIQUE INDEX IF NOT EXISTS "daily_snapshot_company_row_unique"
  ON "DailyFinancialSnapshot" ("companyId", "date")
  WHERE "branchId" IS NULL;
