import { Prisma, UserStatus } from '@prisma/client';
import {
  addDaysToDateStr,
  dayOfWeekForDateStr,
  TASHKENT_OFFSET_MS,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { claimSystemTask } from './task-claim';
import { scheduleTaskOutbox } from './task-outbox.service';
import { OPEN_STATUSES } from './task-transitions';

export { claimSystemTask };

type Tx = Prisma.TransactionClient;

/** 10:00 Tashkent. */
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
 * The «Dars bo'ldimi?» task, a `Task` row (spec 2026-10-07 §7). Written
 * straight to the table, not through `TasksService.create`: there is no
 * caller to check and no author, and the generic `task.assigned` notice would
 * duplicate the lesson-end message the administrators already get.
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
  const task = await tx.task.create({
    data: {
      companyId: args.companyId,
      branchId: args.branchId,
      kind: 'LESSON_QUESTION',
      title: lessonTaskText(args),
      priority: 'HIGH',
      dueAt: args.dueAt,
      authorId: null,
      entityType: 'Group',
      entityId: args.groupId,
      sourceKey: `unmarked:${args.groupId}:${args.dateStr}`,
      participants: {
        create: assigneeIds.map((userId) => ({
          userId,
          role: 'ASSIGNEE' as const,
        })),
      },
      events: { create: [{ type: 'CREATED', actorId: null, via: 'SYSTEM' }] },
    },
    select: { id: true },
  });
  // The reminder an hour before `dueAt` and the overdue notice at it
  // (ADR-0054 rule 6), written like any other task's.
  await scheduleTaskOutbox(tx, {
    id: task.id,
    dueAt: args.dueAt,
    authorId: null,
    participants: assigneeIds.map((userId) => ({
      userId,
      role: 'ASSIGNEE' as const,
    })),
  });
  return task.id;
}

/**
 * Closes the task once its lesson is answered (ADR-0054 rules unchanged). An
 * administrator on the task takes it (`claimSystemTask`: the others' copies
 * go); anyone else — a director, the CEO, a cancellation made elsewhere —
 * closes it for everyone. A person answering is recorded as the holder either
 * way; a system close (`actorId` null) records nobody.
 */
export async function closeLessonTask(
  tx: Tx,
  taskId: string | null,
  actorId: number | null,
): Promise<void> {
  if (!taskId) return;
  // Whoever answers holds the task from then on, even without having pressed
  // «Ko'rdim» first — a later press by another administrator is told who took
  // it. `claimSystemTask` takes the lesson row first (lock order) and also
  // sets `Task.claimedById`; a non-assignee (director, CEO) is recorded here.
  const claimed =
    actorId !== null && (await claimSystemTask(tx, taskId, actorId));
  if (actorId !== null && !claimed) {
    await tx.unmarkedLesson.updateMany({
      where: { taskId },
      data: { claimedById: actorId },
    });
  }
  const { count } = await tx.task.updateMany({
    where: { id: taskId, status: { in: [...OPEN_STATUSES] } },
    data: {
      status: 'DONE',
      closedAt: new Date(),
      ...(actorId !== null && !claimed ? { claimedById: actorId } : {}),
    },
  });
  if (count > 0) {
    await tx.taskEvent.create({
      data: {
        taskId,
        type: 'AUTO_CLOSED',
        actorId,
        // A person answering, or the system closing it with its group.
        meta: {
          reason: actorId !== null ? 'LESSON_ANSWERED' : 'GROUP_DELETED',
        },
        via: 'SYSTEM',
      },
    });
  }
  await tx.taskOutbox.deleteMany({ where: { taskId, sentAt: null } });
}
