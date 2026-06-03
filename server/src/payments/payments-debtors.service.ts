import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollmentStatus, Prisma, StudentStatus } from '@prisma/client';
import {
  calculateDebtAmount,
  calculatePerLessonCost,
} from '../billing/debtor-check.helper';
import {
  computeEnrollmentCoverage,
  type CoveragePrismaLike,
} from '../billing/lesson-coverage.helper';
import { tashkentDateStr } from '../attendance/shared/date-utils';

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
   * Scoped to a single group: returns the enrolled students whose balance
   * has already gone negative (real debt). `perLessonCost` and
   * `suggestedPayment` (the full-cycle course price) are still surfaced
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
        // Debtor = balance has already gone negative. The billing layer
        // now writes a SINGLE_UNCOVERED LESSON_DEDUCTION on every attended
        // lesson when the student can't cover it, so a low but positive
        // balance is no longer the "needs to pay" signal — only an
        // actually-negative balance is.
        student: { balance: { lt: 0 } },
      },
      select: {
        id: true,
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

    // Joriy sikl: har qarzdor enrollment'ining eng so'nggi (eng katta seq)
    // siklini shared coverage dvigateli orqali topamiz, shunda admin
    // "qaysi sikl, qaysi sanalardagi darslar to'lanmagan" ekanini ko'radi.
    const { byDeduction } = await computeEnrollmentCoverage(
      this.prisma as unknown as CoveragePrismaLike,
      enrollments.map((e) => e.id),
    );
    const latestCycleByEnrollment = new Map<
      string,
      {
        cycleSequenceNumber: number;
        capacity: number;
        coveredCount: number;
        firstCoveredDate: string | null;
        lastCoveredDate: string | null;
      }
    >();
    for (const cov of byDeduction.values()) {
      if (!cov.enrollmentId) continue;
      const existing = latestCycleByEnrollment.get(cov.enrollmentId);
      if (existing && existing.cycleSequenceNumber >= cov.cycleSequenceNumber) {
        continue;
      }
      latestCycleByEnrollment.set(cov.enrollmentId, {
        cycleSequenceNumber: cov.cycleSequenceNumber,
        capacity: cov.capacity,
        coveredCount: cov.coveredCount,
        firstCoveredDate: cov.firstCoveredDate
          ? tashkentDateStr(cov.firstCoveredDate)
          : null,
        lastCoveredDate: cov.lastCoveredDate
          ? tashkentDateStr(cov.lastCoveredDate)
          : null,
      });
    }

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
        // null = hech qachon to'liq sikl ochilmagan (sof SINGLE_UNCOVERED qarz).
        currentCycle: latestCycleByEnrollment.get(e.id) ?? null,
      })),
    };
  }
}
