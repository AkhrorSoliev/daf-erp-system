import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { assertManualDueAt } from './task-due';
import { planParticipantChange } from './task-participants-diff';
import { TASK_DETAIL_SELECT, type TaskCtx, type TaskRow } from './task-select';
import { OPEN_STATUSES } from './task-transitions';
import type { UpdateTaskDto } from './dto/update-task.dto';

type Tx = Prisma.TransactionClient;
type ScheduleOutbox = (tx: Tx, task: TaskRow) => Promise<void>;

/** Who is on a manual, open task: the author changes the lists; the caller emits after the commit. */
export async function setParticipantsTx(
  tx: Tx,
  { row, access }: TaskCtx,
  assigneeIds: number[],
  watcherIds: number[],
  userId: number,
  schedule: ScheduleOutbox,
): Promise<{ updated: TaskRow; added: number[]; removed: number[] }> {
  const id = row.id;
  if (!access.canManage) {
    throw new ForbiddenException("Ijrochilarni faqat beruvchi o'zgartiradi");
  }
  if (row.kind !== 'MANUAL') {
    throw new BadRequestException(
      "Tizim topshirig'ining ijrochisi o'zgartirilmaydi",
    );
  }
  if (!OPEN_STATUSES.includes(row.status)) {
    throw new BadRequestException("Yopilgan topshiriq o'zgartirilmaydi");
  }
  const plan = planParticipantChange(
    new Map(row.participants.map((p) => [p.userId, p.role])),
    assigneeIds,
    watcherIds,
  );
  const { removed, flipped, fresh, added } = plan;
  if (!added.length && !removed.length) {
    return { updated: row, added: [], removed: [] };
  }

  if (removed.length) {
    await tx.taskParticipant.deleteMany({
      where: { taskId: id, userId: { in: removed } },
    });
    await tx.taskOutbox.deleteMany({
      where: { taskId: id, userId: { in: removed }, sentAt: null },
    });
  }
  for (const role of ['ASSIGNEE', 'WATCHER'] as const) {
    const ids = flipped.filter((f) => f.role === role).map((f) => f.userId);
    if (ids.length) {
      await tx.taskParticipant.updateMany({
        where: { taskId: id, userId: { in: ids } },
        data: { role },
      });
    }
  }
  if (fresh.length) {
    await tx.taskParticipant.createMany({
      data: fresh.map(({ userId: u, role }) => ({
        taskId: id,
        userId: u,
        role,
      })),
      skipDuplicates: true,
    });
  }
  await tx.taskEvent.create({
    data: {
      taskId: id,
      type: 'ASSIGNEE',
      actorId: userId,
      meta: { added, removed },
      via: 'WEB',
    },
  });
  const updated = await tx.task.findFirst({
    where: { id },
    select: TASK_DETAIL_SELECT,
  });
  if (!updated) throw new NotFoundException('Topshiriq topilmadi');
  if (updated.dueAt) await schedule(tx, updated);
  return { updated, added, removed };
}

/**
 * Title, description, priority and due date of a manual, open task.
 * `dueAt` is the parsed input (`undefined` = not sent, `null` = clear) and
 * `holidays` the set it is checked against, both read before the transaction.
 */
export async function updateFieldsTx(
  tx: Tx,
  { row, access }: TaskCtx,
  dto: UpdateTaskDto,
  dueAt: Date | null | undefined,
  holidays: ReadonlySet<string>,
  schedule: ScheduleOutbox,
): Promise<{ updated: TaskRow; dueChanged: boolean }> {
  const id = row.id;
  if (!access.canManage) {
    throw new ForbiddenException("Faqat beruvchi o'zgartira oladi");
  }
  if (row.kind !== 'MANUAL') {
    throw new BadRequestException("Tizim topshirig'i tahrirlanmaydi");
  }
  if (!OPEN_STATUSES.includes(row.status)) {
    throw new BadRequestException("Yopilgan topshiriq o'zgartirilmaydi");
  }
  const data: Prisma.TaskUncheckedUpdateInput = {};
  if (dto.title !== undefined) data.title = dto.title.trim();
  if (dto.description !== undefined) {
    data.description = dto.description?.trim() || null;
  }
  if (dto.priority !== undefined) data.priority = dto.priority;
  let dueChanged = false;
  if (dueAt !== undefined) {
    if (dueAt) assertManualDueAt(dueAt, holidays);
    data.dueAt = dueAt;
    dueChanged = (dueAt?.getTime() ?? null) !== (row.dueAt?.getTime() ?? null);
  }
  const updated = await tx.task.update({
    where: { id },
    data,
    select: TASK_DETAIL_SELECT,
  });
  if (dueChanged) {
    // The old reminders are for the old due date.
    await tx.taskOutbox.deleteMany({ where: { taskId: id, sentAt: null } });
    if (updated.dueAt) await schedule(tx, updated);
  }
  return { updated, dueChanged };
}
