-- Add BALANCE_WITHDRAWAL TransactionType for admin-driven balance drains.
-- A BALANCE_WITHDRAWAL row reduces a student's balance and recognizes the
-- drained amount as system revenue for a chosen accounting month. Optionally,
-- the admin may also credit the teacher's salary for that month (via a linked
-- SalaryAccrual with attendanceId IS NULL).
ALTER TYPE "TransactionType" ADD VALUE 'BALANCE_WITHDRAWAL';

-- SalaryAccrual.attendanceId becomes nullable so withdrawal-based accruals
-- (no real attendance row backs them) can be persisted.
ALTER TABLE "SalaryAccrual" ALTER COLUMN "attendanceId" DROP NOT NULL;

-- Extend the unique key with attendanceId so withdrawal-based accruals
-- (attendanceId IS NULL) can stack within the same month. Postgres treats
-- NULLs as distinct in UNIQUE constraints, so multiple NULL-attendance rows
-- are allowed. Lesson accruals (attendanceId IS NOT NULL) retain the
-- original "one accrual per (user, student, group, lessonDate)" rule
-- because attendanceId itself is unique per attendance row.
DROP INDEX IF EXISTS "SalaryAccrual_userId_studentId_groupId_lessonDate_key";

CREATE UNIQUE INDEX "SalaryAccrual_userId_studentId_groupId_lessonDate_attendanceId_key"
  ON "SalaryAccrual" ("userId", "studentId", "groupId", "lessonDate", "attendanceId");
