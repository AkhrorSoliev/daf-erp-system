import { Prisma } from '@prisma/client';
import { LESSON_ALERT_TYPES } from './notification-kind';

/** The lesson's day rides in the key: `<TYPE>:<YYYY-MM-DD>` (notification-kind.ts). */
export const lessonDay = Prisma.sql`split_part(n."groupKey", ':', 2)::date`;

/**
 * SQL over `"Notification" n`, the ONE definition of a lesson alert nothing
 * will ever close: one of `LESSON_ALERT_TYPES`, still open, whose lesson day
 * is before `today` ('YYYY-MM-DD', Tashkent), and for whose (group, day) no
 * «Dars bo'ldimi?» question is waiting. The tick and the 23:00 sweep ask only
 * about today, so such a day can no longer produce an answer event. A PENDING
 * question is the one thing that keeps the alert: the administrator still owes
 * the answer, and giving it closes the alerts through the resolver. A deleted
 * group is never taught again (`group.deleted`), so its PENDING questions,
 * which deletion leaves behind, do not count.
 *
 * Read by the resolver's 03:00 sweep and by the one-time cleanup
 * (`scripts/lib/notification-cleanup.ts`), so both pick the same rows. Today
 * itself stays out: its question may still open tonight.
 */
export function pastLessonAlerts(today: string): Prisma.Sql {
  return Prisma.sql`n."actionRequired" AND n."resolvedAt" IS NULL
    AND n."relatedEntityType" = 'Group' AND n."groupKey" IS NOT NULL
    AND n."type"::text IN (${Prisma.join(LESSON_ALERT_TYPES)})
    AND ${lessonDay} < ${today}::date
    AND NOT EXISTS (
      SELECT 1 FROM "UnmarkedLesson" u JOIN "Group" g ON g."id" = u."groupId"
      WHERE u."groupId" = n."relatedEntityId" AND u."date" = ${lessonDay}
        AND u."status" = 'PENDING' AND g."deletedAt" IS NULL)`;
}
