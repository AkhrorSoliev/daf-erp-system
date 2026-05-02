-- ================================================================================
-- LessonReschedule: per-(groupId, originalDate) lesson move.
--
-- The lesson originally scheduled for `originalDate` is moved to `newDate`.
-- Validation:
--   - attendance write to `originalDate` is rejected (lesson was moved away)
--   - attendance write to `newDate` is allowed even if it's not in
--     `Group.exactDays` (it's an ad-hoc lesson day)
--
-- Two partial unique indexes guard against double-booking:
--   - at most one active reschedule originating from (groupId, originalDate)
--   - at most one active reschedule landing on (groupId, newDate)
-- ================================================================================

-- CreateTable
CREATE TABLE "LessonReschedule" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "originalDate" DATE NOT NULL,
    "newDate" DATE NOT NULL,
    "reason" TEXT,
    "scheduledById" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,

    CONSTRAINT "LessonReschedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonReschedule_groupId_originalDate_idx" ON "LessonReschedule"("groupId", "originalDate");
CREATE INDEX "LessonReschedule_groupId_newDate_idx" ON "LessonReschedule"("groupId", "newDate");
CREATE INDEX "LessonReschedule_companyId_idx" ON "LessonReschedule"("companyId");
CREATE INDEX "LessonReschedule_deletedAt_idx" ON "LessonReschedule"("deletedAt");

-- Partial unique: at most one active reschedule per source / destination.
CREATE UNIQUE INDEX "lesson_reschedule_active_origin_unique"
ON "LessonReschedule"("groupId", "originalDate")
WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "lesson_reschedule_active_destination_unique"
ON "LessonReschedule"("groupId", "newDate")
WHERE "deletedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "LessonReschedule"
  ADD CONSTRAINT "LessonReschedule_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LessonReschedule"
  ADD CONSTRAINT "LessonReschedule_scheduledById_fkey"
  FOREIGN KEY ("scheduledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LessonReschedule"
  ADD CONSTRAINT "LessonReschedule_deletedById_fkey"
  FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
