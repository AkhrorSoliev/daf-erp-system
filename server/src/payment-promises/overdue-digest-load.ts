import type { PrismaService } from '../prisma/prisma.service';
import { tashkentDateStr } from '../common/date/tashkent';
import {
  MIN_ALERT_DEBT,
  shortName,
  type OverdueDigestItem,
} from './overdue-digest';

/**
 * The rows of one branch's 09:00 list. A student who has meanwhile paid down
 * below MIN_ALERT_DEBT drops out.
 */
export async function loadOverdueDigestItems(
  prisma: PrismaService,
  companyId: number,
  promiseIds: string[],
): Promise<OverdueDigestItem[]> {
  const promises = await prisma.paymentPromise.findMany({
    where: { id: { in: promiseIds }, companyId },
    orderBy: [{ promiseDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      studentId: true,
      promiseDate: true,
      comment: true,
      balanceAtPromise: true,
      createdBy: { select: { firstName: true, lastName: true } },
      student: {
        select: {
          firstName: true,
          lastName: true,
          balance: true,
          phone: true,
          parentPhone: true,
          enrollments: {
            where: { deletedAt: null, status: { in: ['ACTIVE', 'FROZEN'] } },
            orderBy: { createdAt: 'asc' },
            select: {
              status: true,
              group: {
                select: {
                  name: true,
                  teachers: {
                    select: {
                      teacher: { select: { firstName: true, lastName: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  const owing = promises.filter((p) => -p.student.balance >= MIN_ALERT_DEBT);
  if (owing.length === 0) return [];

  const counts = await prisma.paymentPromise.groupBy({
    by: ['studentId'],
    where: {
      companyId,
      status: 'BROKEN',
      studentId: { in: owing.map((p) => p.studentId) },
    },
    _count: { _all: true },
  });
  const broken = new Map(counts.map((c) => [c.studentId, c._count._all]));

  return owing.map((p) => {
    const s = p.student;
    const teacherOf = (e: (typeof s.enrollments)[number]) => {
      const t = e.group.teachers[0]?.teacher;
      return t ? shortName(t) : null;
    };
    return {
      studentName: `${s.lastName.trim()} ${s.firstName.trim()}`,
      debt: -s.balance,
      debtAtPromise: Math.max(0, -p.balanceAtPromise),
      groups: s.enrollments.map((e) => ({
        name: e.group.name,
        teacher: teacherOf(e),
        frozen: e.status === 'FROZEN',
      })),
      phone: s.phone,
      parentPhone: s.parentPhone,
      promiseDate: tashkentDateStr(p.promiseDate),
      comment: p.comment,
      createdBy: p.createdBy ? shortName(p.createdBy) : null,
      brokenCount: broken.get(p.studentId) ?? 1,
    };
  });
}
