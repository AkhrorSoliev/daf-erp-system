import { BadRequestException } from '@nestjs/common';
import type { Prisma, UnmarkedLesson } from '@prisma/client';
import {
  DAY_END_TIME,
  DAY_START_TIME,
  effectiveLessonTimes,
  lessonHasEnded,
  tashkentClock,
  toMinutes,
} from '../attendance/shared/attendance-window';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';
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
export const MOVED_BEFORE_REASON = "Dars oldindan ko'chirilgan edi";

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

async function createReopenTask(
  tx: Tx,
  companyId: number,
  branchId: number,
  groupId: string,
  groupName: string,
  dateStr: string,
  startTime: string | null,
  endTime: string | null,
  now: Date,
  holidays: ReadonlySet<string>,
): Promise<string | null> {
  const { todayStr } = tashkentClock(now);
  return createLessonTask(tx, {
    companyId,
    branchId,
    groupId,
    groupName,
    dateStr,
    startTime: startTime ?? DAY_START_TIME,
    endTime: endTime ?? DAY_END_TIME,
    dueAt: taskDueAt(nextWorkingDay(todayStr, holidays)),
  });
}

async function reopen(
  tx: Tx,
  row: UnmarkedLesson,
  now: Date,
  holidays: ReadonlySet<string>,
): Promise<void> {
  const group = await tx.group.findUnique({
    where: { id: row.groupId },
    select: { name: true, deletedAt: true },
  });
  if (!group || group.deletedAt) return;
  const taskCommentId = await createReopenTask(
    tx,
    row.companyId,
    row.branchId,
    row.groupId,
    group.name,
    dayOf(row.date),
    row.lessonStartTime,
    row.lessonEndTime,
    now,
    holidays,
  );
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
 * A lesson of a removed cancellation or move that nobody answered for: it
 * ended, no register was taken, no question exists — asked about for the
 * first time. Exempt only when the cancellation or move was made before the
 * lesson ended (`takenAwayAt`): its teacher could not mark it then. One made
 * at or after the end took nothing from the teacher, and deleting it must not
 * grant pay only the CEO may grant — that question is a normal one. A day
 * that is itself the new date of another live move runs on that move's times.
 */
async function openFirstTimeQuestion(
  tx: Tx,
  args: {
    groupId: string;
    date: Date;
    reason: string;
    takenAwayAt: Date;
    now: Date;
    holidays: ReadonlySet<string>;
  },
): Promise<void> {
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
  const movedHere = await tx.lessonReschedule.findFirst({
    where: { groupId: args.groupId, deletedAt: null, newDate: args.date },
    select: { newLessonStartTime: true, newLessonEndTime: true },
  });
  const times = effectiveLessonTimes(group, movedHere);
  const { todayStr, nowMinutes } = tashkentClock(args.now);
  if (
    !lessonHasEnded({
      date: dayOf(args.date),
      todayStr,
      nowMinutes,
      endTime: times.endTime,
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

  const exempt = !lessonHasEnded({
    date: dayOf(args.date),
    ...tashkentClock(args.takenAwayAt),
    endTime: times.endTime,
  });
  const startTime = times.startTime ?? DAY_START_TIME;
  const endTime = times.endTime ?? DAY_END_TIME;
  const taskCommentId = await createReopenTask(
    tx,
    group.companyId,
    group.branchId,
    args.groupId,
    group.name,
    dayOf(args.date),
    startTime,
    endTime,
    args.now,
    args.holidays,
  );
  await tx.unmarkedLesson.create({
    data: {
      companyId: group.companyId,
      branchId: group.branchId,
      groupId: args.groupId,
      date: args.date,
      lessonStartTime: startTime,
      lessonEndTime: endTime,
      teacherPayExempt: exempt,
      exemptReason: exempt ? args.reason : null,
      taskCommentId,
    },
  });
}

/**
 * Deleting a cancellation re-asks the question (§3.5): an answered lesson
 * goes back to PENDING; a lesson with no question, whose cancellation is
 * removed after it ended, is asked about for the first time — exempt when it
 * was cancelled before it ended (`cancelledAt`), because its teacher could
 * not mark a cancelled lesson.
 */
export async function reopenAfterCancellationRemoved(
  tx: Tx,
  args: {
    cancellationId: string;
    groupId: string;
    date: Date;
    cancelledAt: Date;
    now: Date;
    holidays: ReadonlySet<string>;
  },
): Promise<void> {
  const answered = await tx.unmarkedLesson.findFirst({
    where: { cancellationId: args.cancellationId },
  });
  if (answered) return reopen(tx, answered, args.now, args.holidays);
  await openFirstTimeQuestion(tx, {
    groupId: args.groupId,
    date: args.date,
    reason: CANCELLED_BEFORE_REASON,
    takenAwayAt: args.cancelledAt,
    now: args.now,
    holidays: args.holidays,
  });
}

/**
 * A move outlives what happened to its original day: a holiday declared after
 * it, or a cancellation made through a stale tab. The lesson-end sweep never
 * asks about such a day, so deleting the move must not either. The
 * `holidays` argument covers only today onward, so a past day is read here.
 */
async function originalDayIsClosed(
  tx: Tx,
  groupId: string,
  day: Date,
): Promise<boolean> {
  const group = await tx.group.findUnique({
    where: { id: groupId },
    select: { branchId: true },
  });
  if (!group) return true;
  const holidays = await buildHolidayDateSet(tx, day, day, group.branchId);
  if (holidays.has(dayOf(day))) return true;
  const cancelled = await tx.lessonCancellation.findFirst({
    where: { groupId, date: day, deletedAt: null },
    select: { id: true },
  });
  return cancelled !== null;
}

/**
 * Deleting a move re-asks the question the same way: a move that answered it
 * puts the row back to PENDING; a move made in advance (no row ever existed),
 * deleted after the original lesson ended, opens the first-time exempt
 * question for the ORIGINAL date. The caller has already soft-deleted the
 * move in this transaction, so it is read by id, whatever its `deletedAt`.
 */
export async function reopenAfterRescheduleRemoved(
  tx: Tx,
  args: { rescheduleId: string; now: Date; holidays: ReadonlySet<string> },
): Promise<void> {
  const answered = await tx.unmarkedLesson.findFirst({
    where: { rescheduleId: args.rescheduleId },
  });
  if (answered) return reopen(tx, answered, args.now, args.holidays);

  const removed = await tx.lessonReschedule.findUnique({
    where: { id: args.rescheduleId },
    select: { groupId: true, originalDate: true, createdAt: true },
  });
  if (!removed) return;
  if (await originalDayIsClosed(tx, removed.groupId, removed.originalDate)) {
    return;
  }
  await openFirstTimeQuestion(tx, {
    groupId: removed.groupId,
    date: removed.originalDate,
    reason: MOVED_BEFORE_REASON,
    takenAwayAt: removed.createdAt,
    now: args.now,
    holidays: args.holidays,
  });
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
