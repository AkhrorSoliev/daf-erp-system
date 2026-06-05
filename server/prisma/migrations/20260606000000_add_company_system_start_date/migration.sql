-- AlterTable
-- Global reporting floor. When set, attendance stats / analytics reports do not
-- count or display data before this date. Used at the May-1 2026 cutover so the
-- mid-April go-live noise never surfaces. NULL = no floor.
ALTER TABLE "Company" ADD COLUMN "systemStartDate" TIMESTAMP(3);
