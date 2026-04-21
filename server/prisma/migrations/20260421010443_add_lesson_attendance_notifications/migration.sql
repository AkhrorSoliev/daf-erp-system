-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'LESSON_STARTED';
ALTER TYPE "NotificationType" ADD VALUE 'ATTENDANCE_ADMIN_ALERT';
ALTER TYPE "NotificationType" ADD VALUE 'ATTENDANCE_TEACHER_WARNING';
ALTER TYPE "NotificationType" ADD VALUE 'ATTENDANCE_MISSING_TEACHER';
ALTER TYPE "NotificationType" ADD VALUE 'ATTENDANCE_MISSING_ADMIN';
ALTER TYPE "NotificationType" ADD VALUE 'ATTENDANCE_COMPLETED';
