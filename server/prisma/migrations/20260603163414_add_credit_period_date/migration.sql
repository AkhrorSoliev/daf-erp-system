-- AlterTable
-- Carry-over anchor for late-payment salary accruals. NULL = bucket by lessonDate
-- (unchanged behaviour). When set, the accrual is credited to the period that
-- contains this date instead, while lessonDate still drives the rate version.
ALTER TABLE "SalaryAccrual" ADD COLUMN "creditPeriodDate" TIMESTAMP(3);
