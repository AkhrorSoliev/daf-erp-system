import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, TaskEventVia } from '@prisma/client';
import type { TaskCtx } from './task-select';
import { OPEN_STATUSES } from './task-transitions';

type Tx = Prisma.TransactionClient;

/** Steps belong to manual tasks that are still open. */
function assertStepsEditable(row: TaskCtx['row']) {
  if (row.kind !== 'MANUAL') {
    throw new BadRequestException("Tizim topshirig'ida qadam yo'q");
  }
  if (!OPEN_STATUSES.includes(row.status)) {
    throw new BadRequestException("Yopilgan topshiriq o'zgartirilmaydi");
  }
}

/** The step and its history row; `title` is already trimmed and not blank. */
export async function addStepTx(
  tx: Tx,
  { row, access }: TaskCtx,
  title: string,
  userId: number,
): Promise<void> {
  if (!access.canWork) {
    throw new ForbiddenException(
      "Qadam qo'shish uchun ijrochi yoki beruvchi bo'lish kerak",
    );
  }
  assertStepsEditable(row);
  const max = await tx.taskStep.aggregate({
    where: { taskId: row.id },
    _max: { position: true },
  });
  await tx.taskStep.create({
    data: {
      taskId: row.id,
      title,
      position: (max._max.position ?? -1) + 1,
    },
  });
  await tx.taskEvent.create({
    data: {
      taskId: row.id,
      type: 'STEP',
      actorId: userId,
      meta: { action: 'added', title },
      via: 'WEB',
    },
  });
}

/** `patch.title`, when given, is already trimmed and not blank. */
export async function updateStepTx(
  tx: Tx,
  { row, access }: TaskCtx,
  stepId: string,
  patch: { title?: string; done?: boolean },
  userId: number,
  via: TaskEventVia = 'WEB',
): Promise<void> {
  const { title } = patch;
  if (title !== undefined && !access.canManage) {
    throw new ForbiddenException("Qadam nomini faqat beruvchi o'zgartiradi");
  }
  if (patch.done !== undefined && !access.canWork) {
    throw new ForbiddenException('Qadamni ijrochi yoki beruvchi belgilaydi');
  }
  assertStepsEditable(row);
  // Scoped by the task: a step id of another task is not found.
  const step = await tx.taskStep.findFirst({
    where: { id: stepId, taskId: row.id },
  });
  if (!step) throw new NotFoundException('Qadam topilmadi');
  // Only a real change is written or logged: ticking a done step again
  // would restamp who finished it and when.
  const newTitle =
    title !== undefined && title !== step.title ? title : undefined;
  const doneChanged =
    patch.done !== undefined && patch.done !== (step.doneAt !== null);
  if (newTitle === undefined && !doneChanged) return;
  const data: Prisma.TaskStepUncheckedUpdateInput = {};
  if (newTitle !== undefined) data.title = newTitle;
  if (doneChanged) {
    data.doneAt = patch.done ? new Date() : null;
    data.doneById = patch.done ? userId : null;
  }
  await tx.taskStep.update({ where: { id: stepId }, data });
  if (newTitle !== undefined) {
    await tx.taskEvent.create({
      data: {
        taskId: row.id,
        type: 'STEP',
        actorId: userId,
        meta: { action: 'renamed', from: step.title, to: newTitle },
        via,
      },
    });
  }
  if (doneChanged) {
    await tx.taskEvent.create({
      data: {
        taskId: row.id,
        type: 'STEP',
        actorId: userId,
        meta: {
          action: patch.done ? 'done' : 'undone',
          title: newTitle ?? step.title,
        },
        via,
      },
    });
  }
}

export async function deleteStepTx(
  tx: Tx,
  { row, access }: TaskCtx,
  stepId: string,
  userId: number,
): Promise<void> {
  if (!access.canManage) {
    throw new ForbiddenException("Qadamni faqat beruvchi o'chiradi");
  }
  assertStepsEditable(row);
  // Scoped by the task: a step id of another task is not found.
  const step = await tx.taskStep.findFirst({
    where: { id: stepId, taskId: row.id },
  });
  if (!step) throw new NotFoundException('Qadam topilmadi');
  const { count } = await tx.taskStep.deleteMany({
    where: { id: stepId, taskId: row.id },
  });
  if (count === 0) throw new NotFoundException('Qadam topilmadi');
  await tx.taskEvent.create({
    data: {
      taskId: row.id,
      type: 'STEP',
      actorId: userId,
      meta: { action: 'deleted', title: step.title },
      via: 'WEB',
    },
  });
}
