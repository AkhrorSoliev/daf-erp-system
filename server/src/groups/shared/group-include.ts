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
};

export function formatGroup(group: any) {
  const { _count, teachers, ...rest } = group;
  return {
    ...rest,
    teachers: teachers.map((gt: any) => gt.teacher),
    studentCount: _count?.enrollments ?? 0,
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
