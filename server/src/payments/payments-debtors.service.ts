import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReportBranchIds,
  branchIdWhere,
  resolveCallerReportBranchIds,
  studentBranchWhere,
} from '../common/finance/report-branch-scope';
import {
  EnrollmentStatus,
  PaymentPromiseStatus,
  Prisma,
  StudentStatus,
} from '@prisma/client';
import {
  calculateDebtAmount,
  calculatePerLessonCost,
} from '../billing/debtor-check.helper';
import {
  computeEnrollmentCoverage,
  type CoveragePrismaLike,
} from '../billing/lesson-coverage.helper';
import { tashkentDateStr } from '../attendance/shared/date-utils';
import { STUDENT_ROSTER_ORDER_BY } from '../common/student-roster-order';

@Injectable()
export class PaymentsDebtorsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Resolve the effective branch scope for a debtors query.
   * - CEO / Administrator: company-wide; an explicit `requestedBranchId`
   *   (from the branch switcher) narrows the result.
   * - Branch Director: hard-restricted to their own `mainBranch`; an explicit
   *   branch filter must intersect it (else nothing — RBAC rule).
   * - Other roles (Cashier): company-wide, honoring an explicit filter.
   * Returns `undefined` for "all branches", or a concrete id list (possibly
   * empty → the caller short-circuits to an empty result).
   */
  private async resolveBranchScope(
    userId: number,
    _roles: string[],
    requestedBranchId?: number,
  ): Promise<number[] | undefined> {
    // One resolver, not a fourth copy of the rule. The debtors list returns
    // names, phones and balances, so an Administrator exemption meant the whole
    // company's debtor contact list regardless of which branch they work in.
    const ids = await resolveCallerReportBranchIds(
      this.prisma,
      userId,
      requestedBranchId,
    );
    return ids ?? undefined;
  }

  /**
   * Canonical "active debtor" predicate, shared by the list, the count and
   * the summary aggregate so the page's table and cards can never drift.
   */
  private debtorWhere(
    companyId: number,
    branchIds?: number[],
  ): Prisma.StudentWhereInput {
    return {
      companyId,
      deletedAt: null,
      status: StudentStatus.ACTIVE,
      balance: { lt: 0 },
      ...(branchIds
        ? { branches: { some: { branchId: { in: branchIds } } } }
        : {}),
    };
  }

  async getDebtors(
    companyId: number,
    query: {
      branchId?: number;
      page?: number;
      pageSize?: number;
      search?: string;
      sortBy?: 'balance' | 'firstName' | 'lastName';
      order?: 'asc' | 'desc';
      promise?: 'has_open' | 'overdue';
      userId: number;
      roles: string[];
    },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const branchIds = await this.resolveBranchScope(
      query.userId,
      query.roles,
      query.branchId,
    );
    if (branchIds && branchIds.length === 0) {
      return { data: [], total: 0, page, pageSize };
    }

    const where = this.debtorWhere(companyId, branchIds);

    // Payment-promise filter — students with an active / broken promise.
    if (query.promise === 'has_open') {
      where.paymentPromises = { some: { status: 'OPEN' } };
    } else if (query.promise === 'overdue') {
      where.paymentPromises = { some: { status: 'BROKEN' } };
    }

    // Unified search across name / phone / id — same OR shape as
    // StudentsRead so the two pages behave identically.
    const search = query.search?.trim();
    if (search) {
      const conditions: Prisma.StudentWhereInput[] = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
      const asNumber = Number(search);
      if (!Number.isNaN(asNumber) && Number.isInteger(asNumber)) {
        conditions.push({ id: { equals: asNumber } });
      }
      where.OR = conditions;
    }

    const dir: Prisma.SortOrder = query.order === 'desc' ? 'desc' : 'asc';
    const orderBy: Prisma.StudentOrderByWithRelationInput =
      query.sortBy === 'firstName'
        ? { firstName: dir }
        : query.sortBy === 'lastName'
          ? { lastName: dir }
          : { balance: query.order ? dir : 'asc' };

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          photo: true,
          balance: true,
          enrollments: {
            where: { status: 'ACTIVE', deletedAt: null },
            select: {
              group: {
                select: {
                  id: true,
                  name: true,
                  course: { select: { name: true } },
                },
              },
            },
          },
          // Active commitment for the "To'lov sanasi / Izoh" column — the
          // latest still-actionable promise (OPEN or BROKEN). KEPT/CANCELLED
          // are historical and intentionally excluded.
          paymentPromises: {
            where: {
              status: {
                in: [PaymentPromiseStatus.OPEN, PaymentPromiseStatus.BROKEN],
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { promiseDate: true, comment: true, status: true },
          },
          // Last outreach call so the debtors row reflects work done from the
          // Aloqa markazi (its note / outcome / who / when).
          callLogs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              note: true,
              outcome: true,
              followUpAt: true,
              createdAt: true,
              calledBy: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.student.count({ where }),
    ]);

    return {
      data: data.map(({ paymentPromises = [], callLogs = [], ...s }) => {
        const promise = paymentPromises[0] ?? null;
        const call = callLogs[0] ?? null;
        return {
          ...s,
          debtAmount: s.balance < 0 ? -s.balance : 0,
          promise: promise
            ? {
                promiseDate: promise.promiseDate.toISOString(),
                comment: promise.comment,
                status: promise.status,
              }
            : null,
          lastCall: call
            ? {
                note: call.note,
                outcome: call.outcome,
                followUpAt: call.followUpAt
                  ? call.followUpAt.toISOString()
                  : null,
                createdAt: call.createdAt.toISOString(),
                calledByName:
                  `${call.calledBy.firstName} ${call.calledBy.lastName}`.trim(),
              }
            : null,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Every active debtor, unpaginated, for the Excel "Qarzdorlar" line-item
   * sheet. Reuses the canonical `debtorWhere` (same predicate as the balance
   * sheet's accountsReceivable), so `total` ties exactly with the Balans sheet.
   * The caller resolves `branchIds` to match the balance-sheet scope. Row list
   * is capped; `total` comes from an aggregate so it stays exact.
   */
  async getDebtorLineItems(companyId: number, branchIds?: number[]) {
    const where = this.debtorWhere(companyId, branchIds);
    const [rows, agg] = await Promise.all([
      this.prisma.student.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          balance: true,
          branches: { select: { branchId: true } },
          enrollments: {
            where: { status: 'ACTIVE', deletedAt: null },
            select: { group: { select: { name: true } } },
          },
        },
        orderBy: { balance: 'asc' }, // most-negative first = largest debt first
        take: 10_001,
      }),
      this.prisma.student.aggregate({
        where,
        _sum: { balance: true },
        _count: true,
      }),
    ]);

    const truncated = rows.length > 10_000;
    return {
      rows: (truncated ? rows.slice(0, 10_000) : rows).map((s) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        phone: s.phone,
        debtAmount: -s.balance,
        branchIds: s.branches.map((b) => b.branchId),
        groups: s.enrollments.map((e) => e.group.name),
      })),
      truncated,
      total: Math.abs(agg._sum.balance ?? 0),
      count: agg._count,
    };
  }

  /**
   * Card-ready aggregate for the debtors page: total owed, debtor count and
   * average debt (lifted from reports-financial), plus the payment-promise
   * counts that power the "Va'da / muddati o'tgan" card. Same `where` and
   * branch scope as the list so the cards always reconcile with the table.
   */
  async getDebtorSummary(
    companyId: number,
    query: { branchId?: number; userId: number; roles: string[] },
  ) {
    const branchIds = await this.resolveBranchScope(
      query.userId,
      query.roles,
      query.branchId,
    );
    if (branchIds && branchIds.length === 0) {
      return {
        totalDebt: 0,
        debtorCount: 0,
        avgDebt: 0,
        openPromises: 0,
        overduePromises: 0,
      };
    }

    const where = this.debtorWhere(companyId, branchIds);
    const promiseScope: Prisma.PaymentPromiseWhereInput = {
      companyId,
      ...(branchIds ? { branchId: { in: branchIds } } : {}),
    };

    const [agg, openPromises, overduePromises] = await Promise.all([
      this.prisma.student.aggregate({
        where,
        _sum: { balance: true },
        _count: true,
      }),
      // Active commitments ("Va'da bergan").
      this.prisma.paymentPromise.count({
        where: { ...promiseScope, status: 'OPEN' },
      }),
      // Broken by the cron and the student still owes ("Muddati o'tgan").
      this.prisma.paymentPromise.count({
        where: {
          ...promiseScope,
          status: 'BROKEN',
          student: { balance: { lt: 0 } },
        },
      }),
    ]);

    const totalDebt = Math.abs(agg._sum.balance ?? 0);
    const debtorCount = agg._count;
    const avgDebt = debtorCount > 0 ? Math.round(totalDebt / debtorCount) : 0;

    return { totalDebt, debtorCount, avgDebt, openPromises, overduePromises };
  }

  async getPending(
    companyId: number,
    query: { branchIds: ReportBranchIds; page?: number; pageSize?: number },
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
      // Resolved scope, not a raw parameter — this list returns names, phones
      // and balances of students who owe money.
      ...studentBranchWhere(query.branchIds),
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
  async getDebtorsForGroup(
    groupId: string,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    // Confined by the GROUP's branch: reaching a group by id from another
    // branch returned its whole debtor roster.
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        companyId,
        deletedAt: null,
        ...branchIdWhere(branchIds),
      },
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
      orderBy: STUDENT_ROSTER_ORDER_BY,
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
