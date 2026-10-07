import type { NotificationType } from '@prisma/client';
import {
  TASK_EVENTS,
  type TaskAssignedPayload,
  type TaskCancelledPayload,
  type TaskCommentedPayload,
  type TaskDueChangedPayload,
  type TaskEventTask,
  type TaskReassignedPayload,
  type TaskReviewRequestedPayload,
  type TaskReviewedPayload,
  type TaskStatusChangedPayload,
  type TaskUnassignedPayload,
} from './task-events';

export interface Notice {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  actionRequired: boolean;
}

type Names = ReadonlyMap<number, string>;
const clip = (s: string, n = 80) => (s.length > n ? s.slice(0, n) + '…' : s);
const who = (names: Names, id: number | null) =>
  id === null ? 'Tizim' : (names.get(id) ?? "Noma'lum");
const assignees = (t: TaskEventTask) =>
  t.participants.filter((p) => p.role === 'ASSIGNEE').map((p) => p.userId);
const watchers = (t: TaskEventTask) =>
  t.participants.filter((p) => p.role === 'WATCHER').map((p) => p.userId);
const everyone = (t: TaskEventTask) => [
  ...new Set([
    ...(t.authorId !== null ? [t.authorId] : []),
    ...t.participants.map((p) => p.userId),
  ]),
];

const STATUS_LABEL: Record<string, string> = {
  NEW: 'Yangi',
  IN_PROGRESS: 'Jarayonda',
  IN_REVIEW: 'Tekshiruvda',
  DONE: 'Bajarildi',
  CANCELLED: 'Bekor qilindi',
};

/** One place decides who hears what; the bell listener and (phase 2) Telegram read it. */
export function planNotices(
  event: string,
  payload: unknown,
  names: Names,
): Notice[] {
  const mk = (
    userIds: number[],
    type: NotificationType,
    title: string,
    message: string,
    actionRequired: boolean,
  ): Notice[] =>
    [...new Set(userIds)].map((userId) => ({
      userId,
      type,
      title,
      message,
      actionRequired,
    }));

  switch (event) {
    case TASK_EVENTS.ASSIGNED: {
      const p = payload as TaskAssignedPayload;
      return mk(
        p.userIds,
        'TASK_ASSIGNED',
        'Yangi topshiriq',
        `${who(names, p.actorId)} sizga topshiriq berdi: «${clip(p.task.title)}»`,
        true,
      );
    }
    case TASK_EVENTS.REASSIGNED: {
      const p = payload as TaskReassignedPayload;
      return mk(
        p.toUserIds,
        'TASK_ASSIGNED',
        "Topshiriq sizga o'tdi",
        `${who(names, p.fromUserId)} ishdan ketgani uchun topshiriq sizga o'tdi: «${clip(p.task.title)}»`,
        true,
      );
    }
    case TASK_EVENTS.UNASSIGNED: {
      const p = payload as TaskUnassignedPayload;
      return mk(
        p.userIds,
        'TASK_UPDATED',
        'Topshiriqdan olib tashlandingiz',
        `${who(names, p.actorId)}: «${clip(p.task.title)}»`,
        false,
      );
    }
    case TASK_EVENTS.REVIEW_REQUESTED: {
      const p = payload as TaskReviewRequestedPayload;
      if (p.task.authorId === null) return [];
      return mk(
        [p.task.authorId],
        'TASK_REVIEW',
        'Tekshiruvga keldi',
        `${who(names, p.actorId)} bajardi: «${clip(p.task.title)}»`,
        true,
      );
    }
    case TASK_EVENTS.REVIEWED: {
      const p = payload as TaskReviewedPayload;
      return p.accepted
        ? mk(
            [...assignees(p.task), ...watchers(p.task)],
            'TASK_STATUS_CHANGED',
            'Qabul qilindi',
            `${who(names, p.actorId)} qabul qildi: «${clip(p.task.title)}»`,
            false,
          )
        : mk(
            assignees(p.task),
            'TASK_STATUS_CHANGED',
            'Topshiriq qaytarildi',
            `${who(names, p.actorId)}: «${p.reason ?? ''}» — ${clip(p.task.title, 60)}`,
            true,
          );
    }
    case TASK_EVENTS.STATUS_CHANGED: {
      const p = payload as TaskStatusChangedPayload;
      if (
        p.task.authorId === null ||
        p.task.authorId === p.actorId ||
        p.to === 'IN_REVIEW' ||
        p.to === 'DONE'
      )
        return [];
      return mk(
        [p.task.authorId],
        'TASK_STATUS_CHANGED',
        'Topshiriq holati',
        `${who(names, p.actorId)}: ${STATUS_LABEL[p.to]} — «${clip(p.task.title, 60)}»`,
        false,
      );
    }
    case TASK_EVENTS.COMMENTED: {
      const p = payload as TaskCommentedPayload;
      return mk(
        everyone(p.task).filter((u) => u !== p.actorId),
        'TASK_UPDATED',
        'Yangi izoh',
        `${who(names, p.actorId)}: «${clip(p.text, 80)}» — ${clip(p.task.title, 50)}`,
        false,
      );
    }
    case TASK_EVENTS.CANCELLED: {
      const p = payload as TaskCancelledPayload;
      return mk(
        [...assignees(p.task), ...watchers(p.task)].filter(
          (u) => u !== p.actorId,
        ),
        'TASK_DELETED',
        'Bekor qilindi',
        `${who(names, p.actorId)} bekor qildi: «${clip(p.task.title)}»`,
        false,
      );
    }
    case TASK_EVENTS.DUE_CHANGED: {
      const p = payload as TaskDueChangedPayload;
      return mk(
        assignees(p.task).filter((u) => u !== p.actorId),
        'TASK_UPDATED',
        "Muddat o'zgardi",
        `«${clip(p.task.title)}»`,
        false,
      );
    }
    default:
      return [];
  }
}
