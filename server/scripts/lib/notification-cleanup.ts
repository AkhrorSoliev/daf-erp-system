import { Prisma } from '@prisma/client';
import { tashkentDateStr } from '../../src/common/date/tashkent';
import {
  lessonDay,
  pastLessonAlerts,
} from '../../src/notifications/past-lesson-alerts';
import { MIN_ALERT_DEBT } from '../../src/payment-promises/overdue-digest';

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

/**
 * A lesson alert whose job is done: its lesson got a register, an answer, a
 * cancellation or a move, or its day is past and no «Dars bo'ldimi?» question
 * is left to answer (`pastLessonAlerts`, the rule of the 03:00 sweep too).
 * Never NULL, like `promiseDone`, so `NOT` of it cannot drop a row from step 4.
 */
function lessonAlertDone(today: string): Prisma.Sql {
  return Prisma.sql`COALESCE(
    (${openLessonAlert} AND ${lessonDoneAt} IS NOT NULL) OR (${pastLessonAlerts(today)}),
    false)`;
}

const paidPromise = Prisma.sql`s."id"::text = n."relatedEntityId"
  AND n."type" = 'PAYMENT_PROMISE_OVERDUE' AND n."relatedEntityType" = 'Student'
  AND n."actionRequired" AND n."resolvedAt" IS NULL AND s."balance" >= 0`;

/**
 * The 09:00 list (one row per recipient, `relatedEntityType 'BrokenPromises'`,
 * `relatedEntityId` = the branch id or 'all') whose job is done: none of its
 * students still owes. Its students are the branch's BROKEN promises that the
 * cron flipped on the list's own Tashkent day (`reminderFiredAt`); a debt
 * under MIN_ALERT_DEBT was never listed, so it does not count. Same rule as
 * `NotificationResolverService.closePaidLists`.
 */
const paidList = Prisma.sql`n."type" = 'PAYMENT_PROMISE_OVERDUE'
  AND n."relatedEntityType" = 'BrokenPromises'
  AND n."actionRequired" AND n."resolvedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "PaymentPromise" p JOIN "Student" s ON s."id" = p."studentId"
    WHERE p."companyId" = n."companyId" AND p."status" = 'BROKEN'
      AND COALESCE(p."branchId"::text, 'all') = n."relatedEntityId"
      AND ((p."reminderFiredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tashkent')::date
        = ((n."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tashkent')::date
      AND s."balance" <= ${-MIN_ALERT_DEBT})`;

/**
 * An overdue-promise row, old (one per student) or list, whose debt is gone.
 * Never NULL (a row with no entity type would turn `NOT` of it into NULL and
 * drop out of step 4).
 */
const promiseDone = Prisma.sql`COALESCE(
  EXISTS (SELECT 1 FROM "Student" s WHERE ${paidPromise}) OR (${paidList}),
  false)`;

/**
 * Old action rows whose job is not open any more. Only a `TASK_*` row whose
 * task is still open keeps waiting; everything else older than the cutoff
 * resolves, the 09:00 promise lists included. The NOT clauses leave out what
 * steps 1-3 close with their own, more exact time, so a dry run counts the
 * same rows apply writes.
 */
function staleAction(cutoff: Date, today: string): Prisma.Sql {
  return Prisma.sql`n."actionRequired" AND n."resolvedAt" IS NULL
    AND n."createdAt" < ${cutoff}
    AND NOT (starts_with(n."type"::text, 'TASK_') AND EXISTS (
      SELECT 1 FROM "Task" t
      WHERE t."id" = n."taskId" AND t."status" IN ('NEW', 'IN_PROGRESS', 'IN_REVIEW')))
    AND NOT EXISTS (SELECT 1 FROM "Task" t WHERE ${closedTask})
    AND NOT ${promiseDone}
    AND NOT ${lessonAlertDone(today)}`;
}

/**
 * Before the phase-5 bell nothing ever closed. The first three steps close
 * the action rows whose job was already done, stamped with the time it was
 * done (never before the row itself; the run time where none is recorded);
 * step 2 also takes the lesson alerts of past days that no question is waiting
 * on, the rule the resolver's 03:00 sweep keeps applying. The fourth resolves
 * what is left of the old history, so «Kutilmoqda» (which shows read rows too)
 * is not inflated for ever; the last marks old unread rows read. Nothing is
 * deleted, and a repeat run finds nothing left.
 */
export function cleanupSteps(now: Date): CleanupStep[] {
  const cutoff = new Date(now.getTime() - OLD_UNREAD_DAYS * 86_400_000);
  const today = tashkentDateStr(now);
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
      // A past day nothing will ever answer records no done-time; the run time
      // stands in for it.
      name: "Hal bo'lgan va o'tib ketgan darslar",
      count: Prisma.sql`SELECT count(*)::int AS n FROM "Notification" n
        WHERE ${lessonAlertDone(today)}`,
      apply: Prisma.sql`UPDATE "Notification" n
        SET "resolvedAt" = GREATEST(n."createdAt", COALESCE(${lessonDoneAt}, ${now}))
        WHERE ${lessonAlertDone(today)}`,
    },
    {
      // The day the debt was cleared is not recorded; the run time stands in.
      name: "Qarzi yopilgan va'dalar",
      count: Prisma.sql`SELECT count(*)::int AS n FROM "Notification" n
        WHERE ${promiseDone}`,
      apply: Prisma.sql`UPDATE "Notification" n SET "resolvedAt" = ${now}
        WHERE ${promiseDone}`,
    },
    {
      // Nothing records when these stopped mattering; the run time stands in.
      name: '7 kundan eski kutilayotganlar',
      count: Prisma.sql`SELECT count(*)::int AS n FROM "Notification" n
        WHERE ${staleAction(cutoff, today)}`,
      apply: Prisma.sql`UPDATE "Notification" n SET "resolvedAt" = ${now}
        WHERE ${staleAction(cutoff, today)}`,
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
