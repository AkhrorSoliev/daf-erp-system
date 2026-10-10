import type { Prisma } from '@prisma/client';
import { lessonTaskAssigneeIds } from './lesson-task';
import { claimSystemTask } from './task-claim';
import { toEventTask, type TaskEventTask } from './task-events';
import { scheduleTaskOutbox } from './task-outbox.service';
import { OPEN_STATUSES } from './task-transitions';

type Tx = Prisma.TransactionClient;

/** Why a «Yangi o'quvchi so'rovi» task closed (`TaskEvent.meta.reason`). */
export type JoinTaskCloseReason =
  | 'JOIN_APPROVED'
  | 'JOIN_REJECTED'
  | 'JOIN_EXPIRED'
  | 'JOIN_REPLACED';

const TITLE_MAX = 200;

export function joinRequestTaskTitle(a: {
  firstName: string;
  lastName: string;
  groupName: string;
}): string {
  return `Yangi o'quvchi so'rovi: ${a.firstName} ${a.lastName} → ${a.groupName}`;
}

/**
 * The «Yangi o'quvchi so'rovi» task (ADR-0080), built like «Dars bo'ldimi?»:
 * no author, the branch's administrators (then directors, then CEOs) as
 * assignees, the first to act takes it. Written straight to the table in the
 * request's transaction; the caller emits `task.assigned` after the commit.
 */
export async function createJoinRequestTask(
  tx: Tx,
  args: {
    companyId: number;
    branchId: number;
    groupId: string;
    requestId: string;
    title: string;
    dueAt: Date;
  },
): Promise<{
  id: string;
  assigneeIds: number[];
  eventTask: TaskEventTask;
} | null> {
  const assigneeIds = await lessonTaskAssigneeIds(
    tx,
    args.companyId,
    args.branchId,
  );
  if (assigneeIds.length === 0) return null;
  const participants = assigneeIds.map((userId) => ({
    userId,
    role: 'ASSIGNEE' as const,
  }));
  const title = args.title.slice(0, TITLE_MAX);
  const task = await tx.task.create({
    data: {
      companyId: args.companyId,
      branchId: args.branchId,
      kind: 'JOIN_REQUEST',
      title,
      priority: 'HIGH',
      dueAt: args.dueAt,
      authorId: null,
      entityType: 'Group',
      entityId: args.groupId,
      sourceKey: `join:${args.requestId}`,
      participants: { create: participants },
      events: { create: [{ type: 'CREATED', actorId: null, via: 'SYSTEM' }] },
    },
    select: { id: true },
  });
  await scheduleTaskOutbox(tx, {
    id: task.id,
    kind: 'JOIN_REQUEST',
    priority: 'HIGH',
    dueAt: args.dueAt,
    authorId: null,
    participants,
  });
  return {
    id: task.id,
    assigneeIds,
    eventTask: toEventTask({
      id: task.id,
      companyId: args.companyId,
      title,
      kind: 'JOIN_REQUEST',
      authorId: null,
      dueAt: args.dueAt,
      status: 'NEW',
      participants,
    }),
  };
}

/**
 * Closes the task once its request is decided. An administrator on the task
 * takes it (`claimSystemTask`: the others' copies go); a director or the CEO
 * is recorded as the holder; the system (expiry, replacement) records nobody.
 */
export async function closeJoinRequestTask(
  tx: Tx,
  taskId: string | null,
  actorId: number | null,
  reason: JoinTaskCloseReason,
): Promise<void> {
  if (!taskId) return;
  const claimed =
    actorId !== null && (await claimSystemTask(tx, taskId, actorId));
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
        meta: { reason },
        via: 'SYSTEM',
      },
    });
  }
  await tx.taskOutbox.deleteMany({ where: { taskId, sentAt: null } });
}
