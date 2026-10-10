import type { Prisma } from '@prisma/client';
import type { TaskAccess } from './task-policy';

const PERSON = {
  id: true,
  firstName: true,
  lastName: true,
  photo: true,
} as const;

export const TASK_CARD_SELECT = {
  id: true,
  companyId: true,
  branchId: true,
  kind: true,
  title: true,
  status: true,
  priority: true,
  dueAt: true,
  authorId: true,
  entityType: true,
  entityId: true,
  requiresPhoto: true,
  batchId: true,
  sourceKey: true,
  claimedById: true,
  returnedCount: true,
  startedAt: true,
  reviewRequestedAt: true,
  closedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: PERSON },
  participants: {
    select: {
      userId: true,
      role: true,
      seenAt: true,
      user: { select: PERSON },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  _count: { select: { steps: true, events: true } },
  steps: { select: { doneAt: true } },
  unmarkedLesson: {
    select: {
      id: true,
      groupId: true,
      date: true,
      status: true,
      teacherPayExempt: true,
      lessonStartTime: true,
      lessonEndTime: true,
      claimedById: true,
      group: {
        select: { name: true, branch: { select: { id: true, name: true } } },
      },
    },
  },
} satisfies Prisma.TaskSelect;

export const TASK_DETAIL_SELECT = {
  ...TASK_CARD_SELECT,
  description: true,
  lastReturnedAt: true,
  cancelReason: true,
  steps: {
    select: {
      id: true,
      title: true,
      position: true,
      doneAt: true,
      doneById: true,
    },
    orderBy: { position: 'asc' as const },
  },
} satisfies Prisma.TaskSelect;

export const TASK_EVENT_SELECT = {
  id: true,
  type: true,
  actorId: true,
  text: true,
  meta: true,
  via: true,
  createdAt: true,
  actor: { select: PERSON },
} satisfies Prisma.TaskEventSelect;

type CardRow = Prisma.TaskGetPayload<{ select: typeof TASK_CARD_SELECT }>;
type DetailRow = Prisma.TaskGetPayload<{ select: typeof TASK_DETAIL_SELECT }>;

export type TaskRow = DetailRow;
export type TaskEventRow = Prisma.TaskEventGetPayload<{
  select: typeof TASK_EVENT_SELECT;
}>;
/** A task the caller may see, with what they may do to it (`loadForAccess`). */
export type TaskCtx = { row: TaskRow; access: TaskAccess };

function person(
  u: {
    id: number;
    firstName: string;
    lastName: string;
    photo: string | null;
  } | null,
) {
  return u
    ? { id: u.id, firstName: u.firstName, lastName: u.lastName, photo: u.photo }
    : null;
}

function lesson(l: CardRow['unmarkedLesson']) {
  if (!l) return null;
  return {
    id: l.id,
    groupId: l.groupId,
    groupName: l.group.name,
    branchName: l.group.branch?.name ?? null,
    date: l.date.toISOString().slice(0, 10),
    status: l.status,
    teacherPayExempt: l.teacherPayExempt,
    lessonStartTime: l.lessonStartTime,
    lessonEndTime: l.lessonEndTime,
    claimedById: l.claimedById,
  };
}

/** The card the board, the list and the entity panel render. */
export function toTaskCard(r: CardRow) {
  const assignees = r.participants.filter((p) => p.role === 'ASSIGNEE');
  const watchers = r.participants.filter((p) => p.role === 'WATCHER');
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    status: r.status,
    priority: r.priority,
    dueAt: r.dueAt,
    branchId: r.branchId,
    entityType: r.entityType,
    entityId: r.entityId,
    requiresPhoto: r.requiresPhoto,
    batchId: r.batchId,
    claimedById: r.claimedById,
    returnedCount: r.returnedCount,
    closedAt: r.closedAt,
    createdAt: r.createdAt,
    author: person(r.author),
    assignees: assignees.map((p) => ({ ...person(p.user)!, seenAt: p.seenAt })),
    watchers: watchers.map((p) => ({ ...person(p.user)!, seenAt: p.seenAt })),
    stepsTotal: r._count.steps,
    stepsDone: r.steps.filter((s) => s.doneAt !== null).length,
    eventsCount: r._count.events,
    unmarkedLesson: lesson(r.unmarkedLesson),
  };
}
export type TaskCard = ReturnType<typeof toTaskCard>;

export function toTaskDetail(r: DetailRow) {
  return {
    ...toTaskCard(r),
    description: r.description,
    lastReturnedAt: r.lastReturnedAt,
    cancelReason: r.cancelReason,
    steps: r.steps,
  };
}
export type TaskDetail = ReturnType<typeof toTaskDetail>;
