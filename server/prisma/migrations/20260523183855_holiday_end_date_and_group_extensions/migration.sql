-- Multi-day holiday support: add Holiday.endDate (NOT NULL after backfill)
-- and create GroupHolidayExtension table tracking endDate extensions
-- caused by holidays so they can be reversed when a holiday is deleted.

-- Step 1: add endDate as nullable so the backfill is safe
ALTER TABLE "Holiday" ADD COLUMN "endDate" TIMESTAMP(3);

-- Step 2: backfill every existing single-day holiday with endDate = date
UPDATE "Holiday" SET "endDate" = "date" WHERE "endDate" IS NULL;

-- Step 3: enforce NOT NULL once the backfill is complete
ALTER TABLE "Holiday" ALTER COLUMN "endDate" SET NOT NULL;

-- Step 4: replace the status-only index with a composite range index
DROP INDEX IF EXISTS "Holiday_status_idx";
CREATE INDEX "Holiday_deletedAt_status_date_endDate_idx"
  ON "Holiday" ("deletedAt", "status", "date", "endDate");

-- Step 5: GroupHolidayExtension table
CREATE TABLE "GroupHolidayExtension" (
  "id"           TEXT NOT NULL,
  "groupId"      TEXT NOT NULL,
  "holidayId"    TEXT NOT NULL,
  "daysExtended" INTEGER NOT NULL,
  "oldEndDate"   TIMESTAMP(3) NOT NULL,
  "newEndDate"   TIMESTAMP(3) NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"  INTEGER,
  CONSTRAINT "GroupHolidayExtension_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupHolidayExtension_groupId_holidayId_key"
  ON "GroupHolidayExtension" ("groupId", "holidayId");
CREATE INDEX "GroupHolidayExtension_holidayId_idx"
  ON "GroupHolidayExtension" ("holidayId");
CREATE INDEX "GroupHolidayExtension_groupId_idx"
  ON "GroupHolidayExtension" ("groupId");

ALTER TABLE "GroupHolidayExtension"
  ADD CONSTRAINT "GroupHolidayExtension_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupHolidayExtension"
  ADD CONSTRAINT "GroupHolidayExtension_holidayId_fkey"
  FOREIGN KEY ("holidayId") REFERENCES "Holiday" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupHolidayExtension"
  ADD CONSTRAINT "GroupHolidayExtension_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
