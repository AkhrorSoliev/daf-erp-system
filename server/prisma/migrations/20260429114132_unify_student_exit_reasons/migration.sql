-- ============================================================
-- Unify Student Exit Reasons
-- ============================================================
-- Rationale:
--   Generalize DepartureReason -> StudentExitReason so a single
--   table covers group removal, freeze, expel, inactive, archive
--   exits. Each row carries an `appliesTo: ExitType[]` array so
--   admins can pick which exit types a reason is valid for.
--
-- Changes:
--   1. New enum: ExitType
--   2. Rename table: DepartureReason -> StudentExitReason
--   3. Rename PK, indexes, FK constraints to match new model
--   4. Add column: appliesTo ExitType[] (existing rows default to {GROUP_REMOVAL})
--   5. Add Student.statusChangeReasonId FK -> StudentExitReason
-- ============================================================

-- 1. New enum
CREATE TYPE "ExitType" AS ENUM ('GROUP_REMOVAL', 'FREEZE', 'EXPEL', 'INACTIVE', 'ARCHIVE');

-- 2. Rename the table
ALTER TABLE "DepartureReason" RENAME TO "StudentExitReason";

-- 3. Rename PK and indexes
ALTER INDEX "DepartureReason_pkey" RENAME TO "StudentExitReason_pkey";
ALTER INDEX "DepartureReason_deletedAt_idx" RENAME TO "StudentExitReason_deletedAt_idx";
ALTER INDEX "DepartureReason_companyId_name_key" RENAME TO "StudentExitReason_companyId_name_key";

-- 3a. Rename FK constraints on the renamed table
ALTER TABLE "StudentExitReason"
  RENAME CONSTRAINT "DepartureReason_companyId_fkey" TO "StudentExitReason_companyId_fkey";
ALTER TABLE "StudentExitReason"
  RENAME CONSTRAINT "DepartureReason_deletedById_fkey" TO "StudentExitReason_deletedById_fkey";

-- 4. Add appliesTo column. Existing rows are group-removal reasons.
ALTER TABLE "StudentExitReason"
  ADD COLUMN "appliesTo" "ExitType"[] NOT NULL DEFAULT ARRAY['GROUP_REMOVAL']::"ExitType"[];

-- 5. Add Student.statusChangeReasonId FK
ALTER TABLE "Student" ADD COLUMN "statusChangeReasonId" TEXT;

ALTER TABLE "Student"
  ADD CONSTRAINT "Student_statusChangeReasonId_fkey"
  FOREIGN KEY ("statusChangeReasonId") REFERENCES "StudentExitReason"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
