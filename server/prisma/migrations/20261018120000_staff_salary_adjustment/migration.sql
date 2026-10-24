-- ADR-0112: the CEO's manual figure for a staff member's monthly pay.
CREATE TABLE IF NOT EXISTS "StaffSalaryAdjustment" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "month" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "calculatedAmount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffSalaryAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StaffSalaryAdjustment_companyId_userId_month_key"
  ON "StaffSalaryAdjustment"("companyId", "userId", "month");
CREATE INDEX IF NOT EXISTS "StaffSalaryAdjustment_companyId_month_idx"
  ON "StaffSalaryAdjustment"("companyId", "month");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StaffSalaryAdjustment_userId_fkey'
  ) THEN
    ALTER TABLE "StaffSalaryAdjustment"
      ADD CONSTRAINT "StaffSalaryAdjustment_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StaffSalaryAdjustment_createdById_fkey'
  ) THEN
    ALTER TABLE "StaffSalaryAdjustment"
      ADD CONSTRAINT "StaffSalaryAdjustment_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
