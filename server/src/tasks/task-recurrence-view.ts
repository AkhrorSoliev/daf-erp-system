import type { Prisma, TaskRecurrenceFreq } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { resolveAccess, type PolicyPerson } from './task-policy';

const PERSON = {
  id: true,
  firstName: true,
  lastName: true,
  photo: true,
} as const;
type Person = {
  id: number;
  firstName: string;
  lastName: string;
  photo: string | null;
};

export const RECURRENCE_VIEW_SELECT = {
  id: true,
  branchId: true,
  authorId: true,
  freq: true,
  weekdays: true,
  dayOfMonth: true,
  dueTime: true,
  title: true,
  assigneeIds: true,
  separateCopies: true,
  active: true,
  nextRunDate: true,
  author: { select: PERSON },
} satisfies Prisma.TaskRecurrenceSelect;
export type RecurrenceRow = Prisma.TaskRecurrenceGetPayload<{
  select: typeof RECURRENCE_VIEW_SELECT;
}>;

export interface RecurrenceView {
  id: string;
  freq: TaskRecurrenceFreq;
  weekdays: number[];
  dayOfMonth: number | null;
  dueTime: string;
  title: string;
  active: boolean;
  separateCopies: boolean;
  /** `YYYY-MM-DD`, Tashkent. */
  nextRunDate: string;
  author: Person;
  assignees: Person[];
  canManage: boolean;
}

/** Who stops, edits and deletes a rule: like a task's manager (spec §5.3). */
export function recurrenceCanManage(
  caller: PolicyPerson,
  r: { authorId: number; branchId: number | null },
): boolean {
  return resolveAccess(caller, {
    authorId: r.authorId,
    branchId: r.branchId,
    participants: [],
  }).canManage;
}

/**
 * `withAssignees: false` names nobody (and reads nobody): the sheet shows the
 * people of a rule only to its author and managers. Only live people are
 * named, so a departed assignee is neither shown nor prefilled.
 */
export async function toRecurrenceViews(
  prisma: PrismaService,
  rows: RecurrenceRow[],
  caller: PolicyPerson,
  withAssignees = true,
): Promise<RecurrenceView[]> {
  const ids = withAssignees
    ? [...new Set(rows.flatMap((r) => r.assigneeIds))]
    : [];
  const people = ids.length
    ? await prisma.user.findMany({
        where: {
          id: { in: ids },
          deletedAt: null,
          isActive: true,
          status: 'ACTIVE',
        },
        select: PERSON,
      })
    : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  return rows.map((r) => ({
    id: r.id,
    freq: r.freq,
    weekdays: r.weekdays,
    dayOfMonth: r.dayOfMonth,
    dueTime: r.dueTime,
    title: r.title,
    active: r.active,
    separateCopies: r.separateCopies,
    // A `@db.Date` comes back as UTC midnight of that day.
    nextRunDate: r.nextRunDate.toISOString().slice(0, 10),
    author: r.author,
    assignees: r.assigneeIds.flatMap((id) => byId.get(id) ?? []),
    canManage: recurrenceCanManage(caller, r),
  }));
}

export async function loadRecurrenceView(
  prisma: PrismaService,
  id: string,
  caller: PolicyPerson,
  withAssignees = true,
): Promise<RecurrenceView | null> {
  const row = await prisma.taskRecurrence.findUnique({
    where: { id },
    select: RECURRENCE_VIEW_SELECT,
  });
  return row
    ? (await toRecurrenceViews(prisma, [row], caller, withAssignees))[0]
    : null;
}
