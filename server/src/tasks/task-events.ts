import type { TaskStatus } from '@prisma/client';

export const TASK_EVENTS = {
  ASSIGNED: 'task.assigned',
  UNASSIGNED: 'task.unassigned',
  STATUS_CHANGED: 'task.status.changed',
  REVIEW_REQUESTED: 'task.review.requested',
  REVIEWED: 'task.reviewed',
  COMMENTED: 'task.commented',
  CANCELLED: 'task.cancelled',
  REASSIGNED: 'task.reassigned',
  DUE_CHANGED: 'task.due.changed',
} as const;

/** The slice every listener needs; the service loads it once per write. */
export interface TaskEventTask {
  id: string;
  companyId: number;
  title: string;
  kind: string;
  authorId: number | null;
  dueAt: Date | null;
  status: TaskStatus;
  participants: { userId: number; role: 'ASSIGNEE' | 'WATCHER' }[];
}

/** The slice of a loaded task that every listener needs. */
export function toEventTask(r: {
  id: string;
  companyId: number;
  title: string;
  kind: string;
  authorId: number | null;
  dueAt: Date | null;
  status: TaskStatus;
  participants: { userId: number; role: 'ASSIGNEE' | 'WATCHER' }[];
}): TaskEventTask {
  return {
    id: r.id,
    companyId: r.companyId,
    title: r.title,
    kind: r.kind,
    authorId: r.authorId,
    dueAt: r.dueAt,
    status: r.status,
    participants: r.participants.map((p) => ({
      userId: p.userId,
      role: p.role,
    })),
  };
}

export interface TaskAssignedPayload {
  task: TaskEventTask;
  actorId: number | null;
  userIds: number[];
  /** A brand-new task, not someone added to an existing one (Telegram wording). */
  created?: boolean;
}
export interface TaskUnassignedPayload {
  task: TaskEventTask;
  actorId: number;
  /** Everyone removed, assignees and watchers alike (the bell tells them all). */
  userIds: number[];
  /**
   * The part of `userIds` that were ASSIGNEES. The task in the payload is the
   * row after the removal, so the roles are gone from it; Telegram tells only
   * these (spec §6.1: a watcher hears «Bajarildi» and «Bekor qilindi» only).
   */
  removedAssigneeIds: number[];
}
export interface TaskStatusChangedPayload {
  task: TaskEventTask;
  actorId: number;
  from: TaskStatus;
  to: TaskStatus;
}
export interface TaskReviewRequestedPayload {
  task: TaskEventTask;
  actorId: number;
}
export interface TaskReviewedPayload {
  task: TaskEventTask;
  actorId: number;
  accepted: boolean;
  reason: string | null;
}
export interface TaskCommentedPayload {
  task: TaskEventTask;
  actorId: number;
  text: string;
}
export interface TaskCancelledPayload {
  task: TaskEventTask;
  actorId: number;
  reason: string | null;
}
export interface TaskReassignedPayload {
  task: TaskEventTask;
  fromUserId: number;
  toUserIds: number[];
}
export interface TaskDueChangedPayload {
  task: TaskEventTask;
  actorId: number;
}
