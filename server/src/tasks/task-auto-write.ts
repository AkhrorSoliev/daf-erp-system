import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  AUTO_KINDS,
  AUTO_RULES,
  type AutoCloseReason,
  type AutoKind,
} from './task-auto-rules';
import { claimSystemTask } from './task-claim';
import { toEventTask, type TaskEventTask } from './task-events';
import { scheduleTaskOutbox } from './task-outbox.service';
import { TASK_CARD_SELECT } from './task-select';
import { OPEN_STATUSES } from './task-transitions';

export interface SystemTaskInput {
  companyId: number;
  branchId: number | null;
  kind: AutoKind;
  title: string;
  description: string | null;
  dueAt: Date;
  entityId: string;
  sourceKey: string;
  assigneeIds: number[];
}

const OPEN = [...OPEN_STATUSES];
const logger = new Logger('TaskAutoWrite');

/**
 * The partial unique index `task_open_source_unique` (one OPEN task per
 * `sourceKey`) refused a second one. The pg adapter reports it as Prisma's
 * P2002 or, unmapped, as the raw Postgres 23505 in `cause`.
 */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === 'P2002' || e?.cause?.code === '23505';
}

/**
 * An automatic task, written like «Dars bo'ldimi?» (`createLessonTask`):
 * author Tizim, priority and entity type from AUTO_RULES, at most one OPEN
 * task per `sourceKey` (spec §7). Null when one is already open, when a
 * concurrent run won the index, or when nobody can take it. The caller emits
 * `task.assigned` once this returns: the rows are committed by then.
 */
export async function createSystemTask(
  prisma: PrismaService,
  input: SystemTaskInput,
): Promise<TaskEventTask | null> {
  // A repeated id would break @@unique([taskId, userId]) and be mistaken for
  // "already open" below.
  const assigneeIds = [...new Set(input.assigneeIds)];
  if (assigneeIds.length === 0) return null;
  const existing = await prisma.task.findFirst({
    where: { sourceKey: input.sourceKey, status: { in: OPEN } },
    select: { id: true },
  });
  if (existing) return null;
  const rule = AUTO_RULES[input.kind];
  const participants = assigneeIds.map((userId) => ({
    userId,
    role: 'ASSIGNEE' as const,
  }));
  try {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          companyId: input.companyId,
          branchId: input.branchId,
          kind: input.kind,
          title: input.title,
          description: input.description,
          priority: rule.priority,
          dueAt: input.dueAt,
          authorId: null,
          entityType: rule.entityType,
          entityId: input.entityId,
          sourceKey: input.sourceKey,
          participants: { create: participants },
          events: {
            create: [{ type: 'CREATED', actorId: null, via: 'SYSTEM' }],
          },
        },
        select: TASK_CARD_SELECT,
      });
      await scheduleTaskOutbox(tx, {
        id: created.id,
        kind: input.kind,
        priority: rule.priority,
        dueAt: input.dueAt,
        authorId: null,
        participants,
      });
      return created;
    });
    return toEventTask(row);
  } catch (err) {
    // The transaction has rolled back by the time it reaches here; a failed
    // INSERT aborts a Postgres transaction, so it cannot be caught inside.
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

/**
 * Closes the OPEN automatic tasks matching `where` (never a manual task,
 * «Dars bo'ldimi?» or a join request): DONE, an `AUTO_CLOSED` row with the
 * reason, the unsent rows gone. One short transaction per task; a task another
 * writer closed meanwhile is skipped, and so is one whose transaction fails
 * (logged; it stays OPEN). Returns every task that closed, for
 * `task.auto-closed`, with the participants it had BEFORE the claim removed
 * the losing assignees.
 *
 * `actorId` is the person whose action closed it (the one who took the
 * payment, logged the call): they are recorded as the holder, like
 * `closeLessonTask` does, so «Yuklama» credits them. Without it the task
 * closes as Tizim.
 */
export async function autoCloseTasks(
  prisma: PrismaService,
  where: Prisma.TaskWhereInput,
  reason: AutoCloseReason,
  now = new Date(),
  actorId: number | null = null,
): Promise<TaskEventTask[]> {
  const open = await prisma.task.findMany({
    where: {
      AND: [where, { kind: { in: [...AUTO_KINDS] } }, { status: { in: OPEN } }],
    },
    select: { id: true },
  });
  const closed: TaskEventTask[] = [];
  for (const { id } of open) {
    // One task failing (deadlock, a conflict with an assignee's claim) must not
    // cost the already committed ones their `task.auto-closed`: the failed one
    // is still OPEN and the next event closes it.
    try {
      const row = await closeOne(prisma, id, reason, now, actorId);
      if (row) closed.push(toEventTask(row));
    } catch (err) {
      logger.error(
        `auto close of task ${id} failed (${reason}): ${(err as Error).message}`,
      );
    }
  }
  return closed;
}

function closeOne(
  prisma: PrismaService,
  id: string,
  reason: AutoCloseReason,
  now: Date,
  actorId: number | null,
) {
  return prisma.$transaction(async (tx) => {
    // Default isolation is enough: the conditional update serialises two
    // closers on the row lock, the second one gets count 0.
    const { count } = await tx.task.updateMany({
      where: { id, status: { in: OPEN } },
      data: { status: 'DONE', closedAt: now },
    });
    if (count === 0) return null;
    // Read BEFORE the claim: the card (and so the event payload) keeps every
    // assignee, including those whose copies the claim removes, so the SSE
    // refresh of `task.auto-closed` reaches them all.
    const card = await tx.task.findUnique({
      where: { id },
      select: TASK_CARD_SELECT,
    });
    if (actorId !== null) {
      // An assignee takes it (the others' copies go); anyone else (director,
      // CEO) is recorded as the holder only when nobody holds it yet.
      const claimed = await claimSystemTask(tx, id, actorId);
      if (!claimed) {
        await tx.task.updateMany({
          where: { id, claimedById: null },
          data: { claimedById: actorId },
        });
      }
    }
    await tx.taskEvent.create({
      data: {
        taskId: id,
        type: 'AUTO_CLOSED',
        actorId,
        meta: { reason },
        via: 'SYSTEM',
      },
    });
    // This is what stops a Telegram notice held for 08:00: the outbox drain
    // does not look at the task state of NOTICE rows, so they must go with
    // the task.
    await tx.taskOutbox.deleteMany({ where: { taskId: id, sentAt: null } });
    return card;
  });
}
