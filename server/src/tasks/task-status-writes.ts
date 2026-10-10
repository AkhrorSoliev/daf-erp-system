import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Prisma, TaskEventVia, TaskStatus } from '@prisma/client';
import { claimSystemTask } from './task-claim';
import { TASK_DETAIL_SELECT, type TaskCtx, type TaskRow } from './task-select';
import { checkTransition } from './task-transitions';

type Tx = Prisma.TransactionClient;

/** An assignee's move; the caller emits the events after the commit. */
export async function changeStatusTx(
  tx: Tx,
  { row, access }: TaskCtx,
  to: Exclude<TaskStatus, 'CANCELLED'>,
  userId: number,
  via: TaskEventVia = 'WEB',
): Promise<{ from: TaskStatus; updated: TaskRow }> {
  const id = row.id;
  if (!access.canWork) {
    throw new ForbiddenException('Bu topshiriqda siz ijrochi emassiz');
  }
  // A manager who is not an assignee moves a task only through review and
  // cancel, never through a plain status change.
  if (!access.isAssignee) {
    throw new BadRequestException(
      'Qabul qilish yoki qaytarish tugmasidan foydalaning',
    );
  }
  // An author who is also the only assignee acts as the assignee, so their
  // own task goes straight to DONE.
  const assignees = row.participants.filter((p) => p.role === 'ASSIGNEE');
  const selfTask =
    assignees.length === 1 &&
    assignees[0].userId === row.authorId &&
    row.authorId === userId;
  const verdict = checkTransition({
    from: row.status,
    to,
    by: 'ASSIGNEE',
    selfTask,
    kind: row.kind,
    requiresPhoto: row.requiresPhoto,
    // No photo upload in this phase: a task that requires one cannot go to review.
    hasFreshPhoto: false,
  });
  if (!verdict.ok) throw new BadRequestException(verdict.message);

  // The first assignee to act takes a system task (claimSystemTask also
  // writes `claimedById` and drops the other assignees).
  if (row.kind !== 'MANUAL' && access.isAssignee && row.claimedById === null) {
    await claimSystemTask(tx, id, userId);
  }
  const now = new Date();
  const data: Prisma.TaskUncheckedUpdateInput = { status: to };
  if (to === 'IN_PROGRESS' && !row.startedAt) data.startedAt = now;
  if (to === 'IN_REVIEW') data.reviewRequestedAt = now;
  if (to === 'DONE') data.closedAt = now;
  const updated = await tx.task.update({
    where: { id },
    data,
    select: TASK_DETAIL_SELECT,
  });
  await tx.taskEvent.create({
    data: {
      taskId: id,
      type: 'STATUS',
      actorId: userId,
      meta: { from: row.status, to },
      via,
    },
  });
  await tx.taskParticipant.updateMany({
    where: { taskId: id, userId, seenAt: null },
    data: { seenAt: now },
  });
  if (to === 'DONE') {
    await tx.taskOutbox.deleteMany({ where: { taskId: id, sentAt: null } });
  }
  return { from: row.status, updated };
}

/** The author accepts or returns; `reason` is trimmed (and required for RETURN). */
export async function reviewTx(
  tx: Tx,
  { row, access }: TaskCtx,
  action: 'ACCEPT' | 'RETURN',
  reason: string,
  userId: number,
  via: TaskEventVia = 'WEB',
): Promise<TaskRow> {
  const id = row.id;
  if (!access.canManage) {
    throw new ForbiddenException('Faqat beruvchi tekshira oladi');
  }
  const to: TaskStatus = action === 'ACCEPT' ? 'DONE' : 'IN_PROGRESS';
  const verdict = checkTransition({
    from: row.status,
    to,
    by: 'MANAGER',
    selfTask: false,
    kind: row.kind,
    requiresPhoto: row.requiresPhoto,
    hasFreshPhoto: true,
  });
  if (!verdict.ok) throw new BadRequestException(verdict.message);
  const now = new Date();
  const data: Prisma.TaskUncheckedUpdateInput =
    action === 'ACCEPT'
      ? { status: 'DONE', closedAt: now }
      : {
          status: 'IN_PROGRESS',
          returnedCount: { increment: 1 },
          lastReturnedAt: now,
        };
  const updated = await tx.task.update({
    where: { id },
    data,
    select: TASK_DETAIL_SELECT,
  });
  await tx.taskEvent.create({
    data: {
      taskId: id,
      type: action === 'ACCEPT' ? 'STATUS' : 'RETURN',
      actorId: userId,
      text: action === 'RETURN' ? reason : null,
      meta: { from: row.status, to },
      via,
    },
  });
  if (action === 'ACCEPT') {
    await tx.taskOutbox.deleteMany({ where: { taskId: id, sentAt: null } });
  }
  return updated;
}

export async function cancelTx(
  tx: Tx,
  { row, access }: TaskCtx,
  reason: string | null,
  userId: number,
): Promise<TaskRow> {
  const id = row.id;
  if (!access.canManage) {
    throw new ForbiddenException('Faqat beruvchi bekor qila oladi');
  }
  const verdict = checkTransition({
    from: row.status,
    to: 'CANCELLED',
    by: 'MANAGER',
    selfTask: false,
    kind: row.kind,
    requiresPhoto: false,
    hasFreshPhoto: true,
  });
  if (!verdict.ok) throw new BadRequestException(verdict.message);
  const updated = await tx.task.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: reason,
    },
    select: TASK_DETAIL_SELECT,
  });
  await tx.taskEvent.create({
    data: {
      taskId: id,
      type: 'CANCELLED',
      actorId: userId,
      text: reason,
      via: 'WEB',
    },
  });
  await tx.taskOutbox.deleteMany({ where: { taskId: id, sentAt: null } });
  return updated;
}
