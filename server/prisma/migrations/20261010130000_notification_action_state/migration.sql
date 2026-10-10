-- Bell state (spec 2026-10-07 §8): what waits for the recipient, what closed
-- itself, and which rows fold into one line. Hand-checked; the dev database is
-- behind main and this was produced with a schema-to-schema diff.

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "actionRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "groupKey" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_relatedEntityId_idx" ON "Notification"("relatedEntityId");

-- CreateIndex
CREATE INDEX "Notification_taskId_idx" ON "Notification"("taskId");

-- Backfill: the same rule as notificationKind (src/notifications/notification-kind.ts).
UPDATE "Notification" SET "actionRequired" = true
WHERE "type" IN ('ATTENDANCE_ADMIN_ALERT', 'ATTENDANCE_MISSING_TEACHER', 'ATTENDANCE_MISSING_ADMIN',
                 'ATTENDANCE_TEACHER_WARNING', 'LESSON_STARTED', 'TASK_ASSIGNED', 'TASK_REMINDER',
                 'TASK_REVIEW', 'PAYMENT_PROMISE_OVERDUE');

-- task-notify-plan.ts decides per notice: a watcher is told, a returned task waits.
UPDATE "Notification" SET "actionRequired" = false
WHERE "type" = 'TASK_ASSIGNED' AND "title" = 'Kuzatuvchi qilindingiz';
UPDATE "Notification" SET "actionRequired" = true
WHERE "type" = 'TASK_STATUS_CHANGED' AND "title" = 'Topshiriq qaytarildi';

-- Lesson alerts are sent on the lesson's own Tashkent day (UTC+5, no DST).
UPDATE "Notification"
SET "groupKey" = "type"::text || ':' || to_char("createdAt" + interval '5 hours', 'YYYY-MM-DD')
WHERE "type" IN ('LESSON_STARTED', 'ATTENDANCE_ADMIN_ALERT', 'ATTENDANCE_TEACHER_WARNING',
                 'ATTENDANCE_MISSING_TEACHER', 'ATTENDANCE_MISSING_ADMIN');
