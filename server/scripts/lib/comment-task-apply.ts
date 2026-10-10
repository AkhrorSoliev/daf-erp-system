/**
 * The write side of `scripts/migrate-comment-tasks.ts`: what one comment turns
 * into, in one transaction. Kept out of the script (no argv, no `run`) so a
 * spec can drive it with a mocked client.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { OPEN_STATUSES } from '../../src/tasks/task-transitions';
import { scheduleTaskOutbox } from '../../src/tasks/task-outbox.service';
import {
  mapCommentTask,
  type CommentTaskRow,
  type MappedCommentTask,
} from './comment-task-map';

/** Neon cold start: the default 5 s interactive timeout is too tight. */
export const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

/**
 * Maps a comment. A «Dars bo'ldimi?» task that would be open is first looked
 * up by its sourceKey: the partial unique index `task_open_source_unique`
 * refuses a second open task for one lesson, and a question asked again after
 * the deploy already has one. The old comment then maps to a DONE row,
 * superseded — it is never skipped, so it still gets `migratedTaskId`.
 */
export async function planCommentTask(
  db: Pick<PrismaClient, 'task'>,
  c: CommentTaskRow,
  branchId: number | null,
): Promise<MappedCommentTask> {
  const m = mapCommentTask(c, branchId);
  if (!m.task.sourceKey || m.task.status === 'DONE') return m;
  const holder = await db.task.findFirst({
    where: { sourceKey: m.task.sourceKey, status: { in: [...OPEN_STATUSES] } },
    select: { id: true, createdAt: true },
  });
  return holder ? mapCommentTask(c, branchId, holder) : m;
}

/** The steps of one comment; the caller owns the transaction. */
export async function applyCommentTask(
  tx: Prisma.TransactionClient,
  c: CommentTaskRow,
  m: MappedCommentTask,
): Promise<string> {
  const t = await tx.task.create({
    data: {
      ...m.task,
      participants: { create: m.participants },
      events: { create: m.events },
    },
    select: { id: true },
  });
  await tx.comment.update({
    where: { id: c.id },
    data: { migratedTaskId: t.id },
  });
  await tx.notification.updateMany({
    where: { commentId: c.id },
    data: { taskId: t.id },
  });
  // Only a lesson no task points at yet: a re-asked question's lesson already
  // carries the new one.
  if (c.unmarkedLesson) {
    await tx.unmarkedLesson.updateMany({
      where: { id: c.unmarkedLesson.id, taskId: null },
      data: { taskId: t.id },
    });
  }
  // The reminder and the overdue notice, written like any other task's. Only
  // for an open one — a closed task is reminded of nothing.
  if (OPEN_STATUSES.includes(m.task.status)) {
    await scheduleTaskOutbox(tx, {
      id: t.id,
      kind: m.task.kind,
      priority: m.task.priority,
      dueAt: m.task.dueAt,
      authorId: m.task.authorId,
      participants: m.participants.map((p) => ({
        userId: p.userId,
        role: p.role,
      })),
    });
  }
  return t.id;
}

/** One comment, one transaction; a failure rolls it back and is returned. */
export async function tryApplyCommentTask(
  prisma: Pick<PrismaClient, '$transaction'>,
  c: CommentTaskRow,
  m: MappedCommentTask,
): Promise<{ ok: true; taskId: string } | { ok: false; error: string }> {
  try {
    const taskId = await prisma.$transaction(
      (tx) => applyCommentTask(tx, c, m),
      TX_OPTIONS,
    );
    return { ok: true, taskId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
