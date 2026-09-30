import { AssigneeStatus, Prisma, UserStatus } from '@prisma/client';
import {
  addDaysToDateStr,
  dayOfWeekForDateStr,
  TASHKENT_OFFSET_MS,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';

type Tx = Prisma.TransactionClient;

/** 10:00 Tashkent — `TaskReminderService` reminds an hour earlier, at 09:00. */
export const TASK_DUE_HOUR = 10;

const ACTIVE_STAFF = {
  deletedAt: null,
  isActive: true,
  status: UserStatus.ACTIVE,
} as const;

/** The first day after `dateStr` that is neither a Sunday nor a holiday. */
export function nextWorkingDay(
  dateStr: string,
  holidays: ReadonlySet<string>,
): string {
  let day = addDaysToDateStr(dateStr, 1);
  while (dayOfWeekForDateStr(day) === 0 || holidays.has(day)) {
    day = addDaysToDateStr(day, 1);
  }
  return day;
}

/** 10:00 Tashkent on `dateStr`, as the stored UTC instant. */
export function taskDueAt(dateStr: string): Date {
  return new Date(
    utcMidnightFromDateStr(dateStr).getTime() +
      TASK_DUE_HOUR * 3_600_000 -
      TASHKENT_OFFSET_MS,
  );
}

export function lessonTaskText(args: {
  groupName: string;
  dateStr: string;
  startTime: string;
  endTime: string;
}): string {
  const [y, m, d] = args.dateStr.split('-');
  return `${args.groupName}, ${d}.${m}.${y} ${args.startTime}–${args.endTime}: davomat olinmadi. Dars bo'ldimi?`;
}

/**
 * Who is asked (spec §3.6): the branch's active administrators — the people
 * the lesson-end reminder already goes to. A branch with none falls back to
 * its directors, and one with neither to the company's CEOs.
 */
export async function lessonTaskAssigneeIds(
  tx: Tx,
  companyId: number,
  branchId: number,
): Promise<number[]> {
  for (const role of ['Administrator', 'Branch Director']) {
    const users = await tx.user.findMany({
      where: {
        ...ACTIVE_STAFF,
        companyId,
        branches: { some: { branchId } },
        roles: { some: { role: { name: role } } },
      },
      select: { id: true },
    });
    if (users.length > 0) return users.map((u) => u.id);
  }
  const ceos = await tx.user.findMany({
    where: {
      ...ACTIVE_STAFF,
      companyId,
      roles: { some: { role: { name: 'CEO' } } },
    },
    select: { id: true },
  });
  return ceos.map((u) => u.id);
}

/**
 * The «Dars bo'ldimi?» task. Written straight to the table, not through
 * `CommentsService.create`: there is no caller to check and no author, and
 * the generic `task.assigned` notification would duplicate the lesson-end
 * message the administrators already get.
 */
export async function createLessonTask(
  tx: Tx,
  args: {
    companyId: number;
    branchId: number;
    groupId: string;
    groupName: string;
    dateStr: string;
    startTime: string;
    endTime: string;
    dueAt: Date;
  },
): Promise<string | null> {
  const assigneeIds = await lessonTaskAssigneeIds(
    tx,
    args.companyId,
    args.branchId,
  );
  if (assigneeIds.length === 0) return null;
  const comment = await tx.comment.create({
    data: {
      entityType: 'Group',
      entityId: args.groupId,
      content: lessonTaskText(args),
      isTask: true,
      isSystem: true,
      authorId: null,
      dueDate: args.dueAt,
      priority: 'HIGH',
      companyId: args.companyId,
      assignees: {
        create: assigneeIds.map((userId) => ({
          userId,
          status: AssigneeStatus.PENDING,
        })),
      },
    },
    select: { id: true },
  });
  return comment.id;
}

/**
 * Closes the task once its lesson is answered. An administrator on the task
 * takes it (the others' copies go) and their copy becomes DONE; anyone else —
 * a director, the CEO, a cancellation made elsewhere — closes every copy. A
 * person answering is recorded as the holder either way; a system close
 * (`actorId` null) records nobody.
 */
export async function closeLessonTask(
  tx: Tx,
  commentId: string | null,
  actorId: number | null,
): Promise<void> {
  if (!commentId) return;
  const now = new Date();
  if (actorId !== null) {
    // Whoever answers holds the task from then on, even without having
    // pressed «Ko'rdim» first — a later press by another administrator is told
    // who took it. Same lock order as `claimSystemTask`: lesson row first.
    await tx.unmarkedLesson.updateMany({
      where: { taskCommentId: commentId },
      data: { claimedById: actorId },
    });
    const own = await tx.commentAssignee.findUnique({
      where: { commentId_userId: { commentId, userId: actorId } },
      select: { id: true, seenAt: true },
    });
    if (own) {
      await tx.commentAssignee.deleteMany({
        where: { commentId, userId: { not: actorId } },
      });
      await tx.commentAssignee.update({
        where: { id: own.id },
        data: {
          status: AssigneeStatus.DONE,
          doneAt: now,
          seenAt: own.seenAt ?? now,
        },
      });
      return;
    }
  }
  await tx.commentAssignee.updateMany({
    where: { commentId, status: { not: AssigneeStatus.DONE } },
    data: { status: AssigneeStatus.DONE, doneAt: now },
  });
}

/**
 * The first administrator to act on a system task takes it (spec §3.6): the
 * other copies are deleted and the lesson remembers who has it. Run inside a
 * Serializable transaction — two administrators pressing at once conflict,
 * and one of them gets an error instead of both losing the task.
 */
export async function claimSystemTask(
  tx: Tx,
  commentId: string,
  userId: number,
): Promise<boolean> {
  const rows = await tx.commentAssignee.findMany({
    where: { commentId },
    select: { userId: true },
  });
  if (!rows.some((r) => r.userId === userId)) return false;
  // The lesson row comes first: two administrators pressing at once would
  // otherwise each delete the other's copy and then wait on this row — a
  // deadlock. Every claimer queues here instead, and the loser fails as a
  // serialization conflict.
  await tx.unmarkedLesson.updateMany({
    where: { taskCommentId: commentId },
    data: { claimedById: userId },
  });
  if (rows.length > 1) {
    await tx.commentAssignee.deleteMany({
      where: { commentId, userId: { not: userId } },
    });
  }
  return true;
}
