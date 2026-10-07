/**
 * Maps one comment task (`Comment.isTask` + `CommentAssignee`) onto a `Task`
 * row, for `scripts/migrate-comment-tasks.ts` (spec 2026-10-07 §10). Pure: the
 * script reads, this decides, `comment-task-apply.ts` writes.
 */
import type { TaskEventType, TaskPriority, TaskStatus } from '@prisma/client';

export interface CommentTaskRow {
  id: string;
  entityType: string;
  entityId: string;
  content: string;
  isSystem: boolean;
  dueDate: Date | null;
  priority: TaskPriority | null;
  authorId: number | null;
  companyId: number;
  createdAt: Date;
  assignees: {
    userId: number;
    status: 'PENDING' | 'SEEN' | 'DONE';
    seenAt: Date | null;
    doneAt: Date | null;
  }[];
  unmarkedLesson: {
    id: string;
    groupId: string;
    date: Date;
    claimedById: number | null;
    status: 'PENDING' | 'HELD' | 'NOT_HELD' | 'RESCHEDULED';
    decidedAt: Date | null;
  } | null;
}

/** The open task that already carries this lesson's sourceKey. */
export interface SupersedingTask {
  id: string;
  createdAt: Date;
}

export function mapCommentTask(
  c: CommentTaskRow,
  branchId: number | null,
  supersededBy: SupersedingTask | null = null,
) {
  const title = c.content.slice(0, 200);
  const description = c.content.length > 200 ? c.content.slice(200) : null;
  const lesson = c.unmarkedLesson;
  const anySeen = c.assignees.some((a) => a.status !== 'PENDING');
  const lastDoneAt = c.assignees.reduce<Date | null>(
    (m, a) => (a.doneAt && (!m || a.doneAt > m) ? a.doneAt : m),
    null,
  );
  const firstSeenAt = c.assignees.reduce<Date | null>(
    (m, a) => (a.seenAt && (!m || a.seenAt < m) ? a.seenAt : m),
    null,
  );

  let status: TaskStatus;
  let closedAt: Date | null = null;
  if (supersededBy) {
    // Asked again after the deploy: the live task is the question now.
    status = 'DONE';
    closedAt = supersededBy.createdAt;
  } else if (lesson) {
    // The lesson row answers a «Dars bo'ldimi?» task, not the assignee copies:
    // the administrators who did not take it keep a PENDING copy for ever.
    if (lesson.status === 'PENDING') {
      status = anySeen ? 'IN_PROGRESS' : 'NEW';
    } else {
      status = 'DONE';
      closedAt = lesson.decidedAt ?? lastDoneAt ?? c.createdAt;
    }
  } else if (c.isSystem) {
    // A system task its lesson no longer points at (the question was asked
    // again): nothing can ever answer it, so it must not stay open.
    status = 'DONE';
    closedAt = lastDoneAt ?? c.createdAt;
  } else {
    const allDone =
      c.assignees.length > 0 && c.assignees.every((a) => a.status === 'DONE');
    status = allDone ? 'DONE' : anySeen ? 'IN_PROGRESS' : 'NEW';
    if (allDone) closedAt = lastDoneAt ?? c.createdAt;
  }

  // A taken lesson task belongs to whoever took it (live `claimSystemTask`
  // drops the other copies). Only while it is open.
  const claimedBy = lesson?.claimedById ?? null;
  const taken =
    status !== 'DONE' && claimedBy !== null
      ? c.assignees.filter((a) => a.userId === claimedBy)
      : [];
  const assignees = taken.length > 0 ? taken : c.assignees;

  const priority: TaskPriority = c.priority ?? 'MEDIUM';
  const dateStr = lesson ? lesson.date.toISOString().slice(0, 10) : null;
  const events: {
    type: TaskEventType;
    actorId: number | null;
    via: 'SYSTEM';
    meta?: { to: 'DONE' };
    createdAt: Date;
  }[] = [
    {
      type: 'CREATED',
      actorId: c.isSystem ? null : c.authorId,
      via: 'SYSTEM',
      createdAt: c.createdAt,
    },
  ];
  if (status === 'DONE' && closedAt) {
    // Who closed it is not recorded on a comment task: «Tizim».
    events.push({
      type: lesson ? 'AUTO_CLOSED' : 'STATUS',
      actorId: null,
      via: 'SYSTEM',
      meta: { to: 'DONE' },
      createdAt: closedAt,
    });
  }

  return {
    task: {
      companyId: c.companyId,
      branchId,
      kind: c.isSystem ? ('LESSON_QUESTION' as const) : ('MANUAL' as const),
      title,
      description,
      status,
      priority,
      dueAt: c.dueDate,
      authorId: c.isSystem ? null : c.authorId,
      entityType: c.entityType,
      entityId: c.entityId,
      sourceKey: lesson ? `unmarked:${lesson.groupId}:${dateStr}` : null,
      claimedById: lesson?.claimedById ?? null,
      startedAt: status === 'IN_PROGRESS' ? (firstSeenAt ?? c.createdAt) : null,
      closedAt,
      createdAt: c.createdAt,
    },
    participants: assignees.map((a) => ({
      userId: a.userId,
      role: 'ASSIGNEE' as const,
      seenAt: a.seenAt,
    })),
    events,
    lessonLink: lesson !== null,
    /** A system task with no lesson to answer it (the dry run flags it). */
    noLesson: c.isSystem && lesson === null,
    supersededBy: supersededBy?.id ?? null,
  };
}

export type MappedCommentTask = ReturnType<typeof mapCommentTask>;
