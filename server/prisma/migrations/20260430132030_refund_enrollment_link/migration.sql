-- Drop existing FK so we can change column nullability
ALTER TABLE "Refund" DROP CONSTRAINT "Refund_contractId_fkey";

-- Make contractId nullable + add enrollmentId
ALTER TABLE "Refund"
  ADD COLUMN "enrollmentId" TEXT,
  ALTER COLUMN "contractId" DROP NOT NULL;

-- Index for enrollmentId lookups
CREATE INDEX "Refund_enrollmentId_idx" ON "Refund"("enrollmentId");

-- Recreate FK with SET NULL on delete (was CASCADE/RESTRICT default before; now optional)
ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- New FK to Enrollment
ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
