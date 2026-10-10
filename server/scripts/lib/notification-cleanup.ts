import { Prisma } from '@prisma/client';

/** Unread rows older than this are marked read once (spec 2026-10-07 §8). */
export const OLD_UNREAD_DAYS = 7;

export interface CleanupStep {
  name: string;
  /** How many rows the step would write (the dry run). */
  count: Prisma.Sql;
  /** The write. */
  apply: Prisma.Sql;
}

const closedTask = Prisma.sql`t."id" = n."taskId"
  AND n."actionRequired" AND n."resolvedAt" IS NULL
  AND t."status" IN ('DONE', 'CANCELLED')`;

// The lesson day rides in the key: `<TYPE>:<YYYY-MM-DD>` (notification-kind.ts).
const lessonDay = Prisma.sql`split_part(n."groupKey", ':', 2)::date`;

/** When the lesson's job got done: a register, an answer, a cancellation or a move. */
const lessonDoneAt = Prisma.sql`LEAST(
  (SELECT min(a."createdAt") FROM "Attendance" a
    WHERE a."groupId" = n."relatedEntityId" AND a."date" = ${lessonDay}),
  (SELECT COALESCE(u."decidedAt", u."updatedAt") FROM "UnmarkedLesson" u
    WHERE u."groupId" = n."relatedEntityId" AND u."date" = ${lessonDay} AND u."status" <> 'PENDING'),
  (SELECT min(c."createdAt") FROM "LessonCancellation" c
    WHERE c."groupId" = n."relatedEntityId" AND c."date" = ${lessonDay} AND c."deletedAt" IS NULL),
  (SELECT min(r."createdAt") FROM "LessonReschedule" r
    WHERE r."groupId" = n."relatedEntityId" AND r."originalDate" = ${lessonDay} AND r."deletedAt" IS NULL)
)`;

const openLessonAlert = Prisma.sql`n."actionRequired" AND n."resolvedAt" IS NULL
  AND n."relatedEntityType" = 'Group' AND n."groupKey" IS NOT NULL`;

const paidPromise = Prisma.sql`s."id"::text = n."relatedEntityId"
  AND n."type" = 'PAYMENT_PROMISE_OVERDUE' AND n."relatedEntityType" = 'Student'
  AND n."actionRequired" AND n."resolvedAt" IS NULL AND s."balance" >= 0`;

/**
 * Old action rows whose job is not open any more. Only a `TASK_*` row whose
 * task is still open keeps waiting; everything else older than the cutoff
 * resolves. The three NOT EXISTS clauses leave out what steps 1-3 close with
 * their own, more exact time, so a dry run counts the same rows apply writes.
 */
function staleAction(cutoff: Date): Prisma.Sql {
  return Prisma.sql`n."actionRequired" AND n."resolvedAt" IS NULL
    AND n."createdAt" < ${cutoff}
    AND NOT (starts_with(n."type"::text, 'TASK_') AND EXISTS (
      SELECT 1 FROM "Task" t
      WHERE t."id" = n."taskId" AND t."status" IN ('NEW', 'IN_PROGRESS', 'IN_REVIEW')))
    AND NOT EXISTS (SELECT 1 FROM "Task" t WHERE ${closedTask})
    AND NOT EXISTS (SELECT 1 FROM "Student" s WHERE ${paidPromise})
    AND NOT (${openLessonAlert} AND ${lessonDoneAt} IS NOT NULL)`;
}

/**
 * Before the phase-5 bell nothing ever closed. The first three steps close
 * the action rows whose job was already done, stamped with the time it was
 * done (never before the row itself); the fourth resolves what is left of
 * the old history, so «Kutilmoqda» (which shows read rows too) is not
 * inflated for ever; the last marks old unread rows read. Nothing is deleted,
 * and a repeat run finds nothing left.
 */
export function cleanupSteps(now: Date): CleanupStep[] {
  const cutoff = new Date(now.getTime() - OLD_UNREAD_DAYS * 86_400_000);
  return [
    {
      name: 'Yopilgan topshiriqlar',
      count: Prisma.sql`SELECT count(*)::int AS n FROM "Notification" n
        JOIN "Task" t ON ${closedTask}`,
      apply: Prisma.sql`UPDATE "Notification" n
        SET "resolvedAt" = GREATEST(n."createdAt", COALESCE(t."closedAt", t."cancelledAt", t."updatedAt"))
        FROM "Task" t WHERE ${closedTask}`,
    },
    {
      name: "Hal bo'lgan darslar",
      count: Prisma.sql`SELECT count(*)::int AS n FROM "Notification" n
        WHERE ${openLessonAlert} AND ${lessonDoneAt} IS NOT NULL`,
      apply: Prisma.sql`UPDATE "Notification" n
        SET "resolvedAt" = GREATEST(n."createdAt", ${lessonDoneAt})
        WHERE ${openLessonAlert} AND ${lessonDoneAt} IS NOT NULL`,
    },
    {
      // The day the debt was cleared is not recorded; the run time stands in.
      name: "Qarzi yopilgan va'dalar",
      count: Prisma.sql`SELECT count(*)::int AS n FROM "Notification" n
        JOIN "Student" s ON ${paidPromise}`,
      apply: Prisma.sql`UPDATE "Notification" n SET "resolvedAt" = ${now}
        FROM "Student" s WHERE ${paidPromise}`,
    },
    {
      // Nothing records when these stopped mattering; the run time stands in.
      name: '7 kundan eski kutilayotganlar',
      count: Prisma.sql`SELECT count(*)::int AS n FROM "Notification" n
        WHERE ${staleAction(cutoff)}`,
      apply: Prisma.sql`UPDATE "Notification" n SET "resolvedAt" = ${now}
        WHERE ${staleAction(cutoff)}`,
    },
    {
      name: "7 kundan eski o'qilmaganlar",
      count: Prisma.sql`SELECT count(*)::int AS n FROM "Notification"
        WHERE "isRead" = false AND "createdAt" < ${cutoff}`,
      apply: Prisma.sql`UPDATE "Notification" SET "isRead" = true
        WHERE "isRead" = false AND "createdAt" < ${cutoff}`,
    },
  ];
}

/** The ten largest badges (spec §8 rule), before or after the run. */
export const BADGE_TOP = Prisma.sql`SELECT "userId", count(*)::int AS n FROM "Notification"
  WHERE "actionRequired" AND "resolvedAt" IS NULL AND NOT "isRead"
  GROUP BY "userId" ORDER BY n DESC LIMIT 10`;
