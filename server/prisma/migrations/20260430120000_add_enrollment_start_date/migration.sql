-- AlterTable: add nullable startDate to Enrollment
-- Backfill is handled separately by scripts/backfill-enrollment-start-date.ts
-- so we keep this migration small and reversible.
ALTER TABLE "Enrollment" ADD COLUMN "startDate" TIMESTAMP(3);
