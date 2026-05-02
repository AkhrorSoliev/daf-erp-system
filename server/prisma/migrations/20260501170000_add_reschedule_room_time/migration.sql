-- ================================================================================
-- Add per-lesson room/time override on LessonReschedule.
-- Nullable — when NULL, the group's default room and lesson start/end times
-- apply on the new date. Useful when a moved lesson needs to use a different
-- room or fit a different time slot.
-- ================================================================================

ALTER TABLE "LessonReschedule"
  ADD COLUMN "newRoomId" TEXT,
  ADD COLUMN "newLessonStartTime" TEXT,
  ADD COLUMN "newLessonEndTime" TEXT;

CREATE INDEX "LessonReschedule_newRoomId_idx" ON "LessonReschedule"("newRoomId");

ALTER TABLE "LessonReschedule"
  ADD CONSTRAINT "LessonReschedule_newRoomId_fkey"
  FOREIGN KEY ("newRoomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
