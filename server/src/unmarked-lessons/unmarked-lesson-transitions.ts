import { BadRequestException } from '@nestjs/common';
import type { Prisma, UnmarkedLesson } from '@prisma/client';
import {
  DAY_END_TIME,
  DAY_START_TIME,
  lessonHasEnded,
  tashkentClock,
  toMinutes,
} from '../attendance/shared/attendance-window';
import {
  closeLessonTask,
  createLessonTask,
  nextWorkingDay,
  taskDueAt,
} from './lesson-task';

type Tx = Prisma.TransactionClient;

/** What the group notice needs about an answered lesson. */
export interface UnmarkedLessonDecision {
  companyId: number;
  branchId: number;
  groupId: string;
  groupName: string;
  date: string;
  lessonStartTime: string;
  lessonEndTime: string;
}

export const CANCELLED_BEFORE_REASON =
  'Dars bekor qilingan edi — ustoz davomat kirita olmagan';

const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

async function decisionOf(
  tx: Tx,
  row: UnmarkedLesson,
): Promise<UnmarkedLessonDecision> {
  const group = await tx.group.findUnique({
    where: { id: row.groupId },
    select: { name: true },
  });
  return {
    companyId: row.companyId,
    branchId: row.branchId,
    groupId: row.groupId,
    groupName: group?.name ?? '',
    date: dayOf(row.date),
    lessonStartTime: row.lessonStartTime,
    lessonEndTime: row.lessonEndTime,
  };
}

/**
 * A cancellation answers «Dars bo'ldimi?» with «Bo'lmadi» (spec §3.5 A),
 * whichever screen made it. A lesson already answered «Bo'ldi» can still be
 * cancelled by a director or the CEO who finds the answer was wrong.
 */
export async function markUnmarkedLessonCancelled(
  tx: Tx,
  args: {
    groupId: string;
    date: Date;
    cancellationId: string;
    actorId: number;
  },
): Promise<UnmarkedLessonDecision | null> {
  const row = await tx.unmarkedLesson.findUnique({
    where: { groupId_date: { groupId: args.groupId, date: args.date } },
  });
  if (!row || (row.status !== 'PENDING' && row.status !== 'HELD')) return null;
  await tx.unmarkedLesson.update({
    where: { id: row.id },
    data: {
      status: 'NOT_HELD',
      cancellationId: args.cancellationId,
      decidedById: args.actorId,
      decidedAt: new Date(),
    },
  });
  if (row.status === 'PENDING') {
    await closeLessonTask(tx, row.taskCommentId, args.actorId);
  }
  return decisionOf(tx, row);
}

/** A make-up lesson must still be ahead, or nobody could mark it either (§3.5 B). */
export function assertMakeUpAhead(
  newDate: Date,
  newStartTime: string | null,
  now: Date,
): void {
  const { todayStr, nowMinutes } = tashkentClock(now);
  const day = dayOf(newDate);
  const ahead =
    day > todayStr ||
    (day === todayStr &&
      newStartTime !== null &&
      toMinutes(newStartTime) > nowMinutes);
  if (!ahead) {
    throw new BadRequestException(
      "Qo'shimcha dars hali boshlanmagan bo'lishi kerak — aks holda uning davomatini ham olib bo'lmaydi",
    );
  }
}

/** A reschedule of a lesson waiting for an answer answers it: moved (§3.5 B). */
export async function markUnmarkedLessonRescheduled(
  tx: Tx,
  args: {
    groupId: string;
    originalDate: Date;
    rescheduleId: string;
    actorId: number;
    newDate: Date;
    newStartTime: string | null;
    now: Date;
  },
): Promise<UnmarkedLessonDecision | null> {
  const row = await tx.unmarkedLesson.findUnique({
    where: { groupId_date: { groupId: args.groupId, date: args.originalDate } },
  });
  if (!row) return null;
  if (row.status === 'HELD') {
    throw new BadRequestException(
      "Bu darsga «Bo'ldi» deb javob berilgan — uni ko'chirib bo'lmaydi",
    );
  }
  if (row.status !== 'PENDING') return null;
  assertMakeUpAhead(args.newDate, args.newStartTime, args.now);
  await tx.unmarkedLesson.update({
    where: { id: row.id },
    data: {
      status: 'RESCHEDULED',
      rescheduleId: args.rescheduleId,
      decidedById: args.actorId,
      decidedAt: args.now,
    },
  });
  await closeLessonTask(tx, row.taskCommentId, args.actorId);
  return decisionOf(tx, row);
}

/** Editing a make-up lesson keeps it ahead of now. */
export async function assertLinkedMakeUpAhead(
  tx: Tx,
  args: {
    rescheduleId: string;
    newDate: Date;
    newStartTime: string | null;
    now: Date;
  },
): Promise<void> {
  const linked = await tx.unmarkedLesson.findFirst({
    where: { rescheduleId: args.rescheduleId },
    select: { id: true },
  });
  if (linked) assertMakeUpAhead(args.newDate, args.newStartTime, args.now);
}

async function reopen(tx: Tx, row: UnmarkedLesson, now: Date): Promise<void> {
  const group = await tx.group.findUnique({
    where: { id: row.groupId },
    select: { name: true, deletedAt: true },
  });
  if (!group || group.deletedAt) return;
  const { todayStr } = tashkentClock(now);
  const taskCommentId = await createLessonTask(tx, {
    companyId: row.companyId,
    branchId: row.branchId,
    groupId: row.groupId,
    groupName: group.name,
    dateStr: dayOf(row.date),
    startTime: row.lessonStartTime,
    endTime: row.lessonEndTime,
    dueAt: taskDueAt(nextWorkingDay(todayStr, new Set())),
  });
  await tx.unmarkedLesson.update({
    where: { id: row.id },
    data: {
      status: 'PENDING',
      cancellationId: null,
      rescheduleId: null,
      decidedById: null,
      decidedAt: null,
      claimedById: null,
      taskCommentId,
    },
  });
}

/**
 * Deleting a cancellation re-asks the question (§3.5): an answered lesson
 * goes back to PENDING; a lesson cancelled before it happened, whose
 * cancellation is removed after it ended, is asked about for the first time —
 * exempt, because its teacher could not mark a cancelled lesson.
 */
export async function reopenAfterCancellationRemoved(
  tx: Tx,
  args: { cancellationId: string; groupId: string; date: Date; now: Date },
): Promise<void> {
  const answered = await tx.unmarkedLesson.findFirst({
    where: { cancellationId: args.cancellationId },
  });
  if (answered) return reopen(tx, answered, args.now);

  const group = await tx.group.findUnique({
    where: { id: args.groupId },
    select: {
      name: true,
      companyId: true,
      branchId: true,
      lessonStartTime: true,
      lessonEndTime: true,
      deletedAt: true,
    },
  });
  if (!group || group.deletedAt) return;
  const { todayStr, nowMinutes } = tashkentClock(args.now);
  if (
    !lessonHasEnded({
      date: dayOf(args.date),
      todayStr,
      nowMinutes,
      endTime: group.lessonEndTime,
    })
  ) {
    return;
  }
  const marked = await tx.attendance.findFirst({
    where: { groupId: args.groupId, date: args.date },
    select: { id: true },
  });
  if (marked) return;
  const existing = await tx.unmarkedLesson.findUnique({
    where: { groupId_date: { groupId: args.groupId, date: args.date } },
    select: { id: true },
  });
  if (existing) return;

  const startTime = group.lessonStartTime ?? DAY_START_TIME;
  const endTime = group.lessonEndTime ?? DAY_END_TIME;
  const taskCommentId = await createLessonTask(tx, {
    companyId: group.companyId,
    branchId: group.branchId,
    groupId: args.groupId,
    groupName: group.name,
    dateStr: dayOf(args.date),
    startTime,
    endTime,
    dueAt: taskDueAt(nextWorkingDay(todayStr, new Set())),
  });
  await tx.unmarkedLesson.create({
    data: {
      companyId: group.companyId,
      branchId: group.branchId,
      groupId: args.groupId,
      date: args.date,
      lessonStartTime: startTime,
      lessonEndTime: endTime,
      teacherPayExempt: true,
      exemptReason: CANCELLED_BEFORE_REASON,
      taskCommentId,
    },
  });
}

/** Deleting the move of an unanswered lesson re-asks the question. */
export async function reopenAfterRescheduleRemoved(
  tx: Tx,
  args: { rescheduleId: string; now: Date },
): Promise<void> {
  const answered = await tx.unmarkedLesson.findFirst({
    where: { rescheduleId: args.rescheduleId },
  });
  if (answered) await reopen(tx, answered, args.now);
}

/** A deleted group's open questions stop asking; their rows stay (no pay). */
export async function closeTasksOfDeletedGroup(
  tx: Tx,
  groupId: string,
): Promise<void> {
  const rows = await tx.unmarkedLesson.findMany({
    where: { groupId, status: 'PENDING' },
    select: { taskCommentId: true },
  });
  for (const r of rows) await closeLessonTask(tx, r.taskCommentId, null);
}
