import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { UploadService } from '../upload/upload.service';
import { isEnrollableGroupStatus } from '../groups/shared/enrollable-statuses';
import {
  JOIN_REQUEST_CLOSED,
  type JoinRequestClosedEvent,
} from './join-request-events';

/** What taking a request in and deciding it both read of a group. */
export const GROUP_SELECT = {
  id: true,
  name: true,
  companyId: true,
  branchId: true,
  statusEnum: true,
  deletedAt: true,
  days: true,
  exactDays: true,
  lessonStartTime: true,
  lessonEndTime: true,
  branch: { select: { status: true, deletedAt: true } },
  teachers: {
    select: { teacher: { select: { firstName: true, lastName: true } } },
    take: 1,
  },
} satisfies Prisma.GroupSelect;
export type JoinGroup = Prisma.GroupGetPayload<{ select: typeof GROUP_SELECT }>;

/** The group, alive, in a live branch, and taking students. */
export function groupTakesStudents(g: JoinGroup): boolean {
  return (
    g.deletedAt === null &&
    isEnrollableGroupStatus(g.statusEnum) &&
    g.branch.status === 'ACTIVE' &&
    g.branch.deletedAt === null
  );
}

export function teacherNameOf(g: JoinGroup): string | null {
  const t = g.teachers[0]?.teacher;
  return t ? `${t.firstName} ${t.lastName}` : null;
}

export function loadJoinGroup(
  prisma: Pick<PrismaService, 'group'>,
  id: string,
): Promise<JoinGroup | null> {
  return prisma.group.findFirst({ where: { id }, select: GROUP_SELECT });
}

/**
 * After a request closed and its transaction committed: its photo goes, its
 * bell rows close.
 */
export async function closeAfterCommit(
  upload: Pick<UploadService, 'deleteFile'>,
  events: Pick<EventEmitter2, 'emit'>,
  r: { companyId: number; taskId: string | null; photo: string | null },
): Promise<void> {
  if (r.photo) await upload.deleteFile(r.photo);
  if (r.taskId) {
    events.emit(JOIN_REQUEST_CLOSED, {
      companyId: r.companyId,
      taskId: r.taskId,
    } satisfies JoinRequestClosedEvent);
  }
}
