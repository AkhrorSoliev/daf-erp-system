import type { Prisma } from '@prisma/client';
import { lessonsOn } from '../attendance/shared/ended-lessons';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';
import { closeLessonTask } from './lesson-task';

type Tx = Prisma.TransactionClient;

const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Whether the group still has a lesson on `day`, by the lesson-end sweep's
 * own rule (`lessonsOn`): the weekly schedule, a live move away or here, a
 * live cancellation, the branch's holidays and the group's dates. Read in the
 * caller's transaction after its move change, so the change counts.
 */
async function isLessonDay(
  tx: Tx,
  groupId: string,
  day: Date,
): Promise<boolean> {
  const group = await tx.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      companyId: true,
      branchId: true,
      exactDays: true,
      lessonStartTime: true,
      lessonEndTime: true,
      startDate: true,
      endDate: true,
    },
  });
  if (!group) return false;
  const reschedules = await tx.lessonReschedule.findMany({
    where: {
      groupId,
      deletedAt: null,
      OR: [{ originalDate: day }, { newDate: day }],
    },
    select: {
      groupId: true,
      originalDate: true,
      newDate: true,
      newLessonStartTime: true,
      newLessonEndTime: true,
    },
  });
  const cancelled = await tx.lessonCancellation.findFirst({
    where: { groupId, date: day, deletedAt: null },
    select: { id: true },
  });
  const holidays = await buildHolidayDateSet(tx, day, day, group.branchId);
  const dayStr = dayOf(day);
  const lessons = lessonsOn({
    dayStr,
    groups: [group],
    reschedules,
    cancelledGroupIds: new Set(cancelled ? [groupId] : []),
    isHoliday: () => holidays.has(dayStr),
  });
  return lessons.length > 0;
}

/**
 * A day a move no longer lands on — the move deleted, or given a new date.
 * The sweep asked about it because the move made it a lesson day; once it is
 * no lesson day (`isLessonDay`), a question still waiting there closes. Left
 * open, «Bo'ldi» on it would register a lesson on a day that has none while
 * the moved lesson is asked about on its own day: one lesson counted twice.
 *
 * NOT_HELD with neither `cancellationId` nor `rescheduleId` means exactly
 * that: no lesson was held that day, because there was none. Decided by
 * whoever changed the move. No Telegram group notice: nothing was cancelled,
 * and the lesson itself is still asked about.
 */
export async function closeQuestionOnFormerMakeUpDay(
  tx: Tx,
  args: { groupId: string; day: Date; actorId: number; now: Date },
): Promise<void> {
  const row = await tx.unmarkedLesson.findUnique({
    where: { groupId_date: { groupId: args.groupId, date: args.day } },
    select: { id: true, status: true, taskCommentId: true },
  });
  if (!row || row.status !== 'PENDING') return;
  if (await isLessonDay(tx, args.groupId, args.day)) return;
  await tx.unmarkedLesson.update({
    where: { id: row.id },
    data: {
      status: 'NOT_HELD',
      decidedById: args.actorId,
      decidedAt: args.now,
    },
  });
  await closeLessonTask(tx, row.taskCommentId, args.actorId);
}
