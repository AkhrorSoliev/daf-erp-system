-- ================================================================================
-- LessonTeacherOverride: per-(groupId, date) substitute roster.
--
-- When an active row exists for (groupId, date), the billing service treats
-- `teacherIds` as the *full effective* roster for that lesson — `Group.teachers`
-- is ignored. Without an override row, billing falls back to `Group.teachers`.
--
-- "At most one active override per (groupId, date)" is enforced via a partial
-- unique index so a soft-deleted override (deletedAt IS NOT NULL) does not
-- block re-creating one.
-- ================================================================================

-- CreateTable
CREATE TABLE "LessonTeacherOverride" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "teacherIds" INTEGER[],
    "reason" TEXT,
    "setById" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,

    CONSTRAINT "LessonTeacherOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonTeacherOverride_groupId_date_idx" ON "LessonTeacherOverride"("groupId", "date");
CREATE INDEX "LessonTeacherOverride_date_idx" ON "LessonTeacherOverride"("date");
CREATE INDEX "LessonTeacherOverride_companyId_idx" ON "LessonTeacherOverride"("companyId");
CREATE INDEX "LessonTeacherOverride_deletedAt_idx" ON "LessonTeacherOverride"("deletedAt");

-- Partial unique: at most one active override per (groupId, date)
CREATE UNIQUE INDEX "lesson_teacher_override_active_unique"
ON "LessonTeacherOverride"("groupId", "date")
WHERE "deletedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "LessonTeacherOverride"
  ADD CONSTRAINT "LessonTeacherOverride_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LessonTeacherOverride"
  ADD CONSTRAINT "LessonTeacherOverride_setById_fkey"
  FOREIGN KEY ("setById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LessonTeacherOverride"
  ADD CONSTRAINT "LessonTeacherOverride_deletedById_fkey"
  FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
