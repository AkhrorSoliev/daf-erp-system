-- AlterTable: Add working hours to Branch
ALTER TABLE "Branch" ADD COLUMN "startOfWorkingDay" TEXT;
ALTER TABLE "Branch" ADD COLUMN "endOfWorkingDay" TEXT;

-- Migrate existing Company working hours to all branches of that company
UPDATE "Branch" b
SET "startOfWorkingDay" = c."startOfWorkingDay",
    "endOfWorkingDay" = c."endOfWorkingDay"
FROM "Company" c
WHERE b."companyId" = c."id"
  AND c."startOfWorkingDay" IS NOT NULL;

-- AlterTable: Remove working hours from Company
ALTER TABLE "Company" DROP COLUMN "startOfWorkingDay";
ALTER TABLE "Company" DROP COLUMN "endOfWorkingDay";
