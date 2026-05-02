-- AlterEnum
-- This migration adds two NotificationType values used by the
-- lesson-reschedule / lesson-cancellation Telegram notification flow.
ALTER TYPE "NotificationType" ADD VALUE 'LESSON_RESCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE 'LESSON_CANCELLED';
