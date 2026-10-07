import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertCallerMayTouchCommentEntity } from '../common/auth/comment-entity-scope';
import { TASK_DETAIL_SELECT, type TaskRow } from './task-select';
import type { CreateTaskDto } from './dto/create-task.dto';

type Tx = Prisma.TransactionClient;

/** A linked record must be one the caller may touch; a User also of their company. */
export async function assertMayLinkEntity(
  prisma: PrismaService,
  caller: { userId: number; roleNames: string[]; companyId: number },
  link: { entityType?: string; entityId?: string },
): Promise<void> {
  const { entityType, entityId } = link;
  if (!entityType || !entityId) return;
  await assertCallerMayTouchCommentEntity(
    prisma,
    caller.userId,
    caller.roleNames,
    entityType,
    entityId,
    caller.companyId,
  );
  // The generic entity guard does not scope a User by company.
  if (entityType === 'User') {
    const linked = await prisma.user.findFirst({
      where: { id: Number(entityId), companyId: caller.companyId },
      select: { id: true },
    });
    if (!linked) throw new NotFoundException('Xodim topilmadi');
  }
}

export type NewTask = {
  companyId: number;
  branchId: number | null;
  authorId: number;
  dto: CreateTaskDto;
  dueAt: Date | null;
  batchId: string | null;
  watcherIds: number[];
};

/** One task per group of assignees, with its participants, steps and first event. */
export async function createCopiesTx(
  tx: Tx,
  t: NewTask,
  groups: number[][],
  schedule: (tx: Tx, task: TaskRow) => Promise<void>,
): Promise<{ ids: number[]; row: TaskRow }[]> {
  const { dto } = t;
  const steps = (dto.steps ?? []).map((s, i) => ({
    title: s.title.trim(),
    position: i,
  }));
  const made: { ids: number[]; row: TaskRow }[] = [];
  for (const ids of groups) {
    const row = await tx.task.create({
      data: {
        companyId: t.companyId,
        branchId: t.branchId,
        kind: 'MANUAL',
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        priority: dto.priority ?? 'MEDIUM',
        dueAt: t.dueAt,
        authorId: t.authorId,
        entityType: dto.entityType ?? null,
        entityId: dto.entityId ?? null,
        batchId: t.batchId,
        participants: {
          create: [
            ...ids.map((userId) => ({ userId, role: 'ASSIGNEE' as const })),
            ...t.watcherIds.map((userId) => ({
              userId,
              role: 'WATCHER' as const,
            })),
          ],
        },
        steps: { create: steps },
        events: {
          create: [{ type: 'CREATED', actorId: t.authorId, via: 'WEB' }],
        },
      },
      select: TASK_DETAIL_SELECT,
    });
    if (t.dueAt) await schedule(tx, row);
    made.push({ ids, row });
  }
  return made;
}
