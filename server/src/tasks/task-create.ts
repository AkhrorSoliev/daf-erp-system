import { NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertCallerMayTouchCommentEntity } from '../common/auth/comment-entity-scope';
import { TASK_EVENTS, toEventTask } from './task-events';
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
  /** The rule that makes it (spec §3.6); absent for a one-off task. */
  recurrenceId?: string | null;
  /** The CREATED row's `via`; the 07:00 run writes SYSTEM. */
  via?: 'WEB' | 'SYSTEM';
};

export type PreparedCreate = {
  branchId: number | null;
  assigneeIds: number[];
  watcherIds: number[];
  groups: number[][];
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
        requiresPhoto: dto.requiresPhoto === true,
        ...(t.recurrenceId ? { recurrenceId: t.recurrenceId } : {}),
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
          create: [
            { type: 'CREATED', actorId: t.authorId, via: t.via ?? 'WEB' },
          ],
        },
      },
      select: TASK_DETAIL_SELECT,
    });
    if (t.dueAt) await schedule(tx, row);
    made.push({ ids, row });
  }
  return made;
}

/** «Har biriga alohida» (spec §3.1): a copy per assignee, else one task for all. */
export function copyGroups(
  separate: boolean,
  assigneeIds: number[],
): number[][] {
  return separate && assigneeIds.length > 1
    ? assigneeIds.map((id) => [id])
    : [assigneeIds];
}

export function batchIdFor(groups: number[][]): string | null {
  return groups.length > 1 ? randomUUID() : null;
}

/**
 * `task.assigned` (`created: true`) for each new copy, then for its watchers.
 * Call it only after the transaction committed. Two plain emits:
 * `event-wiring.spec.ts` reads the name at the call site.
 */
export function emitTaskCreated(
  emitter: EventEmitter2,
  rows: { ids: number[]; row: TaskRow }[],
  actorId: number,
  watcherIds: number[],
): void {
  for (const { ids, row } of rows) {
    emitter.emit(TASK_EVENTS.ASSIGNED, {
      task: toEventTask(row),
      actorId,
      userIds: ids,
      created: true,
    });
    if (watcherIds.length) {
      emitter.emit(TASK_EVENTS.ASSIGNED, {
        task: toEventTask(row),
        actorId,
        userIds: watcherIds,
        created: true,
      });
    }
  }
}
