import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollmentStatus, Prisma, StudentStatus } from '@prisma/client';
import {
  calculateDebtAmount,
  calculatePerLessonCost,
} from '../billing/debtor-check.helper';

@Injectable()
export class PaymentsDebtorsService {
  constructor(private prisma: PrismaService) {}

  async getDebtors(
    companyId: number,
    query: { branchId?: number; page?: number; pageSize?: number },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.StudentWhereInput = {
      companyId,
      deletedAt: null,
      status: StudentStatus.ACTIVE,
      balance: { lt: 0 },
      ...(query.branchId && {
        branches: { some: { branchId: query.branchId } },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          balance: true,
          enrollments: {
            where: { status: 'ACTIVE', deletedAt: null },
            select: {
              group: {
                select: {
                  name: true,
                  course: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { balance: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.student.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async getPending(
    companyId: number,
    query: { branchId?: number; page?: number; pageSize?: number },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.StudentWhereInput = {
      companyId,
      deletedAt: null,
      status: StudentStatus.ACTIVE,
      balance: { lt: 0 },
      enrollments: {
        some: { status: 'ACTIVE', deletedAt: null },
      },
      ...(query.branchId && {
        branches: { some: { branchId: query.branchId } },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          balance: true,
          enrollments: {
            where: { status: 'ACTIVE', deletedAt: null },
            select: {
              group: {
                select: {
                  name: true,
                  course: { select: { name: true, price: true } },
                },
              },
            },
          },
        },
        orderBy: { balance: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.student.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * Per-group debtor list for the attendance "qarzdorlar" panel.
   *
   * Distinct from `getDebtors()`: that one is the global "balance < 0" list
   * across the whole company. This one is scoped to a single group and uses
   * the per-group `perLessonCost` threshold (a student with 5,000 so'm balance
   * is a debtor in a 33,333-so'm/lesson group but not in a 5,000-so'm/lesson
   * group). It also surfaces `suggestedPayment` (the full-cycle course price)
   * so the admin's payment dialog can pre-fill the right amount.
   */
  async getDebtorsForGroup(groupId: string, companyId: number) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, companyId, deletedAt: null },
      select: {
        course: { select: { price: true, lessonPaymentCount: true } },
      },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    const perLessonCost = calculatePerLessonCost(
      group.course.price,
      group.course.lessonPaymentCount,
    );

    // Today's start in Tashkent (UTC+5, no DST). startDate is stored as
    // Tashkent midnight in UTC, so a UTC server's `new Date()` could land
    // before/after midnight depending on timezone — explicit conversion
    // keeps the threshold predictable.
    const now = new Date();
    const tashkentNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    const todayStr = `${tashkentNow.getUTCFullYear()}-${String(
      tashkentNow.getUTCMonth() + 1,
    ).padStart(2, '0')}-${String(tashkentNow.getUTCDate()).padStart(2, '0')}`;
    const todayUtc = new Date(`${todayStr}T00:00:00.000Z`);

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        groupId,
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
        OR: [{ startDate: null }, { startDate: { lte: todayUtc } }],
        student: { balance: { lt: perLessonCost } },
      },
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            photo: true,
            balance: true,
          },
        },
      },
      orderBy: { student: { firstName: 'asc' } },
    });

    return {
      perLessonCost,
      suggestedPayment: group.course.price,
      coursePrice: group.course.price,
      lessonPaymentCount: group.course.lessonPaymentCount,
      debtors: enrollments.map((e) => ({
        ...e.student,
        debtAmount: calculateDebtAmount(
          e.student.balance,
          group.course.price,
          group.course.lessonPaymentCount,
        ),
      })),
    };
  }
}
