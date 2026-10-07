/**
 * Maps one comment task (`Comment.isTask` + `CommentAssignee`) onto a `Task`
 * row, for `scripts/migrate-comment-tasks.ts` (spec 2026-10-07 §10). Pure: the
 * script reads, this decides, the script writes.
 */
import type { TaskPriority, TaskStatus } from '@prisma/client';

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

export function mapCommentTask(c: CommentTaskRow, branchId: number | null) {
  const title = c.content.slice(0, 200);
  const description = c.content.length > 200 ? c.content.slice(200) : null;
  const lesson = c.unmarkedLesson;
  const anySeen = c.assignees.some((a) => a.status !== 'PENDING');
  const lastDoneAt = c.assignees.reduce<Date | null>(
    (m, a) => (a.doneAt && (!m || a.doneAt > m) ? a.doneAt : m),
    null,
  );

  let status: TaskStatus;
  let closedAt: Date | null;
  if (lesson) {
    // The lesson row answers a «Dars bo'ldimi?» task, not the assignee copies:
    // the administrators who did not take it keep a PENDING copy for ever.
    if (lesson.status === 'PENDING') {
      status = anySeen ? 'IN_PROGRESS' : 'NEW';
      closedAt = null;
    } else {
      status = 'DONE';
      closedAt = lesson.decidedAt ?? lastDoneAt ?? c.createdAt;
    }
  } else {
    const allDone =
      c.assignees.length > 0 && c.assignees.every((a) => a.status === 'DONE');
    status = allDone ? 'DONE' : anySeen ? 'IN_PROGRESS' : 'NEW';
    closedAt = allDone ? lastDoneAt : null;
  }

  const priority: TaskPriority = c.priority ?? 'MEDIUM';
  const dateStr = lesson ? lesson.date.toISOString().slice(0, 10) : null;
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
      closedAt,
      createdAt: c.createdAt,
    },
    participants: c.assignees.map((a) => ({
      userId: a.userId,
      role: 'ASSIGNEE' as const,
      seenAt: a.seenAt,
    })),
    events: [
      {
        type: 'CREATED' as const,
        actorId: c.isSystem ? null : c.authorId,
        via: 'SYSTEM' as const,
        createdAt: c.createdAt,
      },
    ],
    lessonLink: lesson !== null,
  };
}
