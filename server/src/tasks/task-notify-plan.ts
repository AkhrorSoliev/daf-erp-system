import type { NotificationType } from '@prisma/client';
import { TASHKENT_OFFSET_MS } from '../common/date/tashkent';
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

/**
 * The Telegram message one person gets about an event (spec 2026-10-07 §6.1):
 * the kind picks the first line, `by` / `from` / `text` / `reason` the line
 * under the title. Names are resolved when the event happens, so a notice
 * held for the morning still says who did it. REMINDER, OVERDUE and CARD are
 * not planned from events: the outbox and the bot's «Topshiriqlarim» use them.
 */
export type TgNotice =
  | { kind: 'ASSIGNED' }
  | { kind: 'ADDED'; by: string }
  | { kind: 'MOVED'; from: string }
  | { kind: 'REMOVED'; by: string }
  | { kind: 'REVIEW'; by: string }
  | { kind: 'ACCEPTED'; by: string }
  | { kind: 'RETURNED'; by: string; reason: string }
  | { kind: 'COMMENT'; by: string; text: string }
  | { kind: 'DONE'; by: string }
  | { kind: 'CANCELLED'; by: string }
  | { kind: 'REMINDER' }
  | { kind: 'OVERDUE' }
  | { kind: 'CARD'; headline?: string };

export interface Notice {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  actionRequired: boolean;
  /** This person's Telegram message; null = the bell only. */
  telegram: TgNotice | null;
}

type Names = ReadonlyMap<number, string>;
type TgFor = (userId: number) => TgNotice | null;
const bellOnly: TgFor = () => null;

const clip = (s: string, n = 80) => (s.length > n ? s.slice(0, n) + '…' : s);
const who = (names: Names, id: number | null) =>
  id === null ? 'Tizim' : (names.get(id) ?? "Noma'lum");
const assignees = (t: TaskEventTask) =>
  t.participants.filter((p) => p.role === 'ASSIGNEE').map((p) => p.userId);
const watchers = (t: TaskEventTask) =>
  t.participants.filter((p) => p.role === 'WATCHER').map((p) => p.userId);
/** Nobody is told about what they just did themselves. */
const notActor = (ids: number[], actorId: number | null) =>
  ids.filter((u) => u !== actorId);
const pad2 = (n: number) => String(n).padStart(2, '0');
/** `dd.MM, HH:mm` on the Tashkent clock. */
const tashkentStamp = (d: Date) => {
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  return `${pad2(t.getUTCDate())}.${pad2(t.getUTCMonth() + 1)}, ${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
};
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

/**
 * One place decides who hears what, on both channels (spec §9.3): the bell
 * listener reads `title` / `message`, the Telegram listener reads `telegram`.
 */
export function planNotices(
  event: string,
  payload: unknown,
  names: Names,
): Notice[] {
  const notices = planFor(event, payload, names);
  // «Dars bo'ldimi?» never goes to Telegram: the lesson-end message covers it.
  const kind = (payload as { task?: TaskEventTask }).task?.kind;
  return kind === 'LESSON_QUESTION'
    ? notices.map((n) => ({ ...n, telegram: null }))
    : notices;
}

/** Author, participants, the actor and the people the payload moves — once each. */
export function noticeUserIds(payload: { task: TaskEventTask }): number[] {
  const x = payload as {
    task: TaskEventTask;
    actorId?: number | null;
    userIds?: number[];
    toUserIds?: number[];
    fromUserId?: number;
  };
  return [
    ...new Set([
      ...(x.task.authorId !== null ? [x.task.authorId] : []),
      ...x.task.participants.map((p) => p.userId),
      // The actor may be neither author nor participant (a CEO cancelling).
      ...(typeof x.actorId === 'number' ? [x.actorId] : []),
      ...(x.userIds ?? []),
      ...(x.toUserIds ?? []),
      ...(x.fromUserId !== undefined ? [x.fromUserId] : []),
    ]),
  ];
}

function planFor(event: string, payload: unknown, names: Names): Notice[] {
  const mk = (
    userIds: number[],
    type: NotificationType,
    title: string,
    message: string,
    actionRequired: boolean,
    telegram: TgFor = bellOnly,
  ): Notice[] =>
    [...new Set(userIds)].map((userId) => ({
      userId,
      type,
      title,
      message,
      actionRequired,
      telegram: telegram(userId),
    }));

  switch (event) {
    case TASK_EVENTS.ASSIGNED: {
      const p = payload as TaskAssignedPayload;
      const added = notActor(p.userIds, p.actorId);
      const watching = new Set(watchers(p.task));
      const tg: TgNotice = p.created
        ? { kind: 'ASSIGNED' }
        : { kind: 'ADDED', by: who(names, p.actorId) };
      return [
        ...mk(
          added.filter((u) => !watching.has(u)),
          'TASK_ASSIGNED',
          'Yangi topshiriq',
          `${who(names, p.actorId)} sizga topshiriq berdi: «${clip(p.task.title)}»`,
          true,
          () => tg,
        ),
        // Watchers hear only «Bajarildi» and «Bekor qilindi» on Telegram.
        ...mk(
          added.filter((u) => watching.has(u)),
          'TASK_ASSIGNED',
          'Kuzatuvchi qilindingiz',
          `${who(names, p.actorId)} sizni kuzatuvchi qildi: «${clip(p.task.title)}»`,
          false,
        ),
      ];
    }
    case TASK_EVENTS.REASSIGNED: {
      const p = payload as TaskReassignedPayload;
      const from = who(names, p.fromUserId);
      return mk(
        p.toUserIds,
        'TASK_ASSIGNED',
        "Topshiriq sizga o'tdi",
        `${from} ishdan ketgani uchun topshiriq sizga o'tdi: «${clip(p.task.title)}»`,
        true,
        () => ({ kind: 'MOVED', from }),
      );
    }
    case TASK_EVENTS.UNASSIGNED: {
      const p = payload as TaskUnassignedPayload;
      const by = who(names, p.actorId);
      // The bell tells every removed person; Telegram only a removed assignee
      // (a watcher hears «Bajarildi» and «Bekor qilindi» and nothing else).
      const wasAssignee = new Set(p.removedAssigneeIds);
      return mk(
        notActor(p.userIds, p.actorId),
        'TASK_UPDATED',
        'Topshiriqdan olib tashlandingiz',
        `${by}: «${clip(p.task.title)}»`,
        false,
        (u) => (wasAssignee.has(u) ? { kind: 'REMOVED', by } : null),
      );
    }
    case TASK_EVENTS.REVIEW_REQUESTED: {
      const p = payload as TaskReviewRequestedPayload;
      if (p.task.authorId === null || p.task.authorId === p.actorId) return [];
      const by = who(names, p.actorId);
      return mk(
        [p.task.authorId],
        'TASK_REVIEW',
        'Tekshiruvga keldi',
        `${by} bajardi: «${clip(p.task.title)}»`,
        true,
        () => ({ kind: 'REVIEW', by }),
      );
    }
    case TASK_EVENTS.REVIEWED: {
      const p = payload as TaskReviewedPayload;
      const by = who(names, p.actorId);
      const watching = new Set(watchers(p.task));
      return p.accepted
        ? mk(
            notActor([...assignees(p.task), ...watchers(p.task)], p.actorId),
            'TASK_STATUS_CHANGED',
            'Qabul qilindi',
            `${by} qabul qildi: «${clip(p.task.title)}»`,
            false,
            (u) =>
              watching.has(u) ? { kind: 'DONE', by } : { kind: 'ACCEPTED', by },
          )
        : mk(
            notActor(assignees(p.task), p.actorId),
            'TASK_STATUS_CHANGED',
            'Topshiriq qaytarildi',
            `${by}: «${clip(p.reason ?? '', 80)}» — ${clip(p.task.title, 60)}`,
            true,
            () => ({ kind: 'RETURNED', by, reason: clip(p.reason ?? '', 300) }),
          );
    }
    case TASK_EVENTS.STATUS_CHANGED: {
      const p = payload as TaskStatusChangedPayload;
      // Only a self-task reaches DONE this way (its author is its only
      // assignee), so the watchers are the ones left to tell.
      if (p.to === 'DONE') {
        const by = who(names, p.actorId);
        return mk(
          notActor(watchers(p.task), p.actorId),
          'TASK_STATUS_CHANGED',
          'Bajarildi',
          `${by} bajardi: «${clip(p.task.title)}»`,
          false,
          () => ({ kind: 'DONE', by }),
        );
      }
      if (
        p.task.authorId === null ||
        p.task.authorId === p.actorId ||
        p.to === 'IN_REVIEW'
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
      const by = who(names, p.actorId);
      const watching = new Set(watchers(p.task));
      return mk(
        everyone(p.task).filter((u) => u !== p.actorId),
        'TASK_UPDATED',
        'Yangi izoh',
        `${by}: «${clip(p.text, 80)}» — ${clip(p.task.title, 50)}`,
        false,
        (u) =>
          watching.has(u)
            ? null
            : { kind: 'COMMENT', by, text: clip(p.text, 300) },
      );
    }
    case TASK_EVENTS.CANCELLED: {
      const p = payload as TaskCancelledPayload;
      const by = who(names, p.actorId);
      const watching = new Set(watchers(p.task));
      return mk(
        [...assignees(p.task), ...watchers(p.task)].filter(
          (u) => u !== p.actorId,
        ),
        'TASK_DELETED',
        'Bekor qilindi',
        `${by} bekor qildi: «${clip(p.task.title)}»`,
        false,
        (u) => (watching.has(u) ? { kind: 'CANCELLED', by } : null),
      );
    }
    case TASK_EVENTS.DUE_CHANGED: {
      const p = payload as TaskDueChangedPayload;
      return mk(
        assignees(p.task).filter((u) => u !== p.actorId),
        'TASK_UPDATED',
        "Muddat o'zgardi",
        `«${clip(p.task.title)}» — ${p.task.dueAt ? `yangi muddat: ${tashkentStamp(p.task.dueAt)}` : 'muddat olib tashlandi'}`,
        false,
      );
    }
    default:
      return [];
  }
}
