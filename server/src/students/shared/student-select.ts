import { Prisma } from '@prisma/client';

export const STUDENT_ROLE_ID = 6;

export const studentSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  extraPhone: true,
  parentPhone: true,
  parentName: true,
  telegram: true,
  telegramChatId: true,
  gender: true,
  dateOfBirth: true,
  photo: true,
  comment: true,
  balance: true,
  placeOfStudy: true,
  address: true,
  passportSeries: true,
  isActive: true,
  status: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
  statusChangedAt: true,
  statusChangedById: true,
  statusChangeReason: true,
  deletedAt: true,
  deletedBy: { select: { id: true, firstName: true, lastName: true } },
  branches: {
    select: {
      branch: { select: { id: true, name: true } },
    },
  },
  enrollments: {
    where: { deletedAt: null, status: 'ACTIVE' },
    select: {
      id: true,
      createdAt: true,
      group: {
        select: {
          id: true,
          name: true,
          level: true,
          status: true,
          days: true,
          exactDays: true,
          lessonStartTime: true,
          lessonEndTime: true,
          startDate: true,
          endDate: true,
          course: { select: { id: true, name: true } },
          teachers: {
            select: {
              teacher: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.StudentSelect;

export function formatStudent(student: any) {
  const {
    enrollments,
    branches,
    deletedBy,
    deletedAt,
    dateOfBirth,
    companyId,
    ...rest
  } = student;

  return {
    ...rest,
    date_of_birth: dateOfBirth?.toISOString() ?? null,
    company_id: companyId ?? null,
    deleted_at: deletedAt ?? null,
    destroyer: deletedBy ?? null,
    branches: branches.map((sb: any) => ({
      id: sb.branch.id,
      name: sb.branch.name,
    })),
    groups: enrollments.map((e: any) => ({
      id: e.group.id,
      enrollmentId: e.id,
      name: e.group.name,
      level: e.group.level ?? null,
      status: e.group.status,
      course_name: e.group.course?.name ?? null,
      days: e.group.days,
      exactDays: e.group.exactDays ?? [],
      lessonStartTime: e.group.lessonStartTime,
      lessonEndTime: e.group.lessonEndTime,
      startDate: e.group.startDate,
      endDate: e.group.endDate,
      teachers: (e.group.teachers ?? []).map((gt: any) => gt.teacher),
      enrolledAt: e.createdAt,
    })),
    balance_on_period: null,
  };
}
