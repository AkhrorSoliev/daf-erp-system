import { Prisma, GroupStatus, EnrollmentStatus } from '@prisma/client';

export const TEACHER_ROLE_ID = 4;

export const groupInclude: Prisma.GroupInclude = {
  course: {
    select: {
      id: true,
      name: true,
      description: true,
      lessonDuration: true,
      lessonMinutes: true,
      courseDuration: true,
      price: true,
      isActive: true,
    },
  },
  room: {
    select: { id: true, name: true, capacity: true },
  },
  branch: {
    select: { id: true, name: true },
  },
  teachers: {
    include: {
      teacher: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          photo: true,
        },
      },
    },
  },
  _count: {
    select: {
      enrollments: {
        where: { deletedAt: null, status: EnrollmentStatus.ACTIVE },
      },
    },
  },
  // The pause the group is in now (ADR-0119): the status dialog asks the
  // restart day from it.
  pauses: {
    where: { endedAt: null },
    select: { plannedResumeOn: true, resumeOn: true, source: true },
    take: 1,
  },
};

export function formatGroup(group: any) {
  const { _count, teachers, pauses, ...rest } = group;
  const open = pauses?.[0];
  return {
    ...rest,
    teachers: teachers.map((gt: any) => gt.teacher),
    studentCount: _count?.enrollments ?? 0,
    pause: open
      ? {
          plannedResumeOn: open.plannedResumeOn
            ? open.plannedResumeOn.toISOString().slice(0, 10)
            : null,
          resumeOn: open.resumeOn
            ? open.resumeOn.toISOString().slice(0, 10)
            : null,
          source: open.source,
        }
      : null,
  };
}

export const INT_TO_GROUP_STATUS: Record<number, GroupStatus> = {
  1: GroupStatus.ACTIVE,
  2: GroupStatus.FORMING,
  3: GroupStatus.PAUSED,
  4: GroupStatus.CANCELLED,
};

export const GROUP_STATUS_TO_INT: Record<string, number> = {
  ACTIVE: 1,
  FORMING: 2,
  PAUSED: 3,
  CANCELLED: 4,
  COMPLETED: 4,
  ARCHIVED: 4,
};
