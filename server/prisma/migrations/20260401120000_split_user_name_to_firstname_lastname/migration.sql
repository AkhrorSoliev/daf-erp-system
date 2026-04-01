-- AlterTable: split "name" into "firstName" + "lastName"

-- Step 1: Add new columns with defaults so existing rows don't break
ALTER TABLE "User" ADD COLUMN "firstName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "lastName" TEXT NOT NULL DEFAULT '';

-- Step 2: Migrate existing data — split "name" on first space
UPDATE "User"
SET "firstName" = CASE
      WHEN POSITION(' ' IN "name") > 0 THEN LEFT("name", POSITION(' ' IN "name") - 1)
      ELSE "name"
    END,
    "lastName" = CASE
      WHEN POSITION(' ' IN "name") > 0 THEN SUBSTRING("name" FROM POSITION(' ' IN "name") + 1)
      ELSE ''
    END;

-- Step 3: Remove defaults now that data is populated
ALTER TABLE "User" ALTER COLUMN "firstName" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "lastName" DROP DEFAULT;

-- Step 4: Drop the old column
ALTER TABLE "User" DROP COLUMN "name";
