import { Injectable } from '@nestjs/common';
import { SalaryPaymentStatus, SalaryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MonthlyScope } from './shared/resolve-monthly-scope';
import {
  FixedMonthlyVersion,
  prorateFixedMonthly,
} from './shared/prorate-fixed-monthly';

export interface StaffRow {
  user: {
    id: number;
    firstName: string;
    lastName: string;
    /**
     * The employee's "Lavozim" — `User.position`, falling back to their first
     * role name for accounts created before the column existed. A cleaner or a
     * guard has a position and NO role, so reading `roles[0]` alone printed a
     * dash for exactly the employee this report exists to pay.
     */
    position: string | null;
    branch: { id: number; name: string } | null;
  };
  /** Prorated fixed-monthly salary for the period (full month = the flat value). */
  monthly: number;
  /** TEACHER_ADVANCE given during the calendar month. */
  advances: number;
  /** payment ? payment.amount (already net of advances) : max(0, monthly − advances). */
  netToPay: number;
  payment: { id: string; amount: number; status: SalaryPaymentStatus } | null;
}

export interface StaffTotals {
  monthly: number;
  advances: number;
  netToPay: number;
}

const ZERO_TOTALS: StaffTotals = { monthly: 0, advances: 0, netToPay: 0 };

/**
 * Non-teaching FIXED_MONTHLY staff (administrators, cashiers, branch directors)
 * for the "Xodimlar oyligi" section of the monthly salary report.
 *
 * Mirrors the FIXED_MONTHLY resolution in `SalaryCalculationService`
 * (`calculateMonthlySalaries`) — same version-at-period lookup, same advance
 * netting, same prorated amount (`prorateFixedMonthly`) — so the SHOWN figure
 * equals what the cron actually PAYS.
 *
 * Teachers on a fixed monthly are intentionally EXCLUDED here (they render in
 * the teacher table with an "Oylik" badge) to avoid listing anyone twice.
 */
@Injectable()
export class SalaryStaffMonthlyService {
  constructor(private prisma: PrismaService) {}

  async computeStaff(
    scope: MonthlyScope,
  ): Promise<{ staff: StaffRow[]; staffTotals: StaffTotals }> {
    const {
      companyId,
      periodStart,
      periodEnd,
      monthStart,
      nextMonthStart,
      periodStartLow,
      periodStartHigh,
      branchId,
      blocked,
      search,
      searchId,
      userId,
    } = scope;

    // 1. Non-teacher global FIXED_MONTHLY configs in branch scope.
    // isActive is NOT filtered: a staff member deactivated mid-cycle must still
    // receive their final (prorated) month — the version's `effectiveTo` bounds
    // the money, and the 4b cascade guarantees a deactivated config's version is
    // always closed (so future months prorate to 0). `deletedAt` is the hard
    // exclusion; `status` is deliberately NOT filtered so a TERMINATED-status
    // user still gets their worked days.
    const configs = await this.prisma.employeeSalaryConfig.findMany({
      where: {
        companyId,
        groupId: null,
        salaryType: SalaryType.FIXED_MONTHLY,
        user: {
          deletedAt: null,
          roles: { none: { role: { name: 'Teacher' } } },
          // Branch-confined caller with no branch → match nothing (fail closed).
          ...(blocked && { id: -1 }),
          ...(userId !== undefined && { id: userId }),
          ...(branchId !== undefined && { branches: { some: { branchId } } }),
          ...(search && {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              ...(searchId !== null ? [{ id: searchId }] : []),
            ],
          }),
        },
      },
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            position: true,
            roles: { select: { role: { select: { name: true } } } },
            branches: {
              select: { branch: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    if (configs.length === 0) return { staff: [], staffTotals: ZERO_TOTALS };

    const configIds = configs.map((c) => c.id);
    const userIds = configs.map((c) => c.userId);

    // 2. FIXED_MONTHLY versions overlapping the period (bulk — no N queries).
    const versionRows = await this.prisma.employeeSalaryConfigVersion.findMany({
      where: {
        configId: { in: configIds },
        salaryType: SalaryType.FIXED_MONTHLY,
        effectiveFrom: { lte: periodEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: periodStart } }],
      },
      select: {
        configId: true,
        value: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    });
    const versByConfig = new Map<string, FixedMonthlyVersion[]>();
    for (const r of versionRows) {
      const arr = versByConfig.get(r.configId) ?? [];
      arr.push({
        value: r.value,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
      });
      versByConfig.set(r.configId, arr);
    }

    // 3. Advances GIVEN during the calendar month (same logic as the teacher pass).
    const advancesAgg = await this.prisma.expense.groupBy({
      by: ['relatedUserId'],
      where: {
        relatedUserId: { in: userIds },
        category: 'TEACHER_ADVANCE',
        companyId,
        deletedAt: null,
        date: { gte: monthStart, lt: nextMonthStart },
      },
      _sum: { amount: true },
    });
    const advancesByUser = new Map(
      advancesAgg.map((a) => [a.relatedUserId as number, a._sum.amount ?? 0]),
    );

    // 4. Settled SalaryPayment bucketed into this month.
    const payments = await this.prisma.salaryPayment.findMany({
      where: {
        companyId,
        userId: { in: userIds },
        status: { not: SalaryPaymentStatus.CANCELLED },
        periodStart: { gte: periodStartLow, lt: periodStartHigh },
      },
      select: { id: true, userId: true, amount: true, status: true },
      orderBy: { createdAt: 'asc' },
    });
    const paymentByUser = new Map<
      number,
      { id: string; amount: number; status: SalaryPaymentStatus }
    >();
    for (const p of payments) {
      const prev = paymentByUser.get(p.userId);
      paymentByUser.set(p.userId, {
        id: p.id,
        amount: (prev?.amount ?? 0) + p.amount,
        status: p.status,
      });
    }

    // 5. Build rows.
    const staff: StaffRow[] = [];
    for (const c of configs) {
      const monthly = prorateFixedMonthly(
        versByConfig.get(c.id) ?? [],
        periodStart,
        periodEnd,
      );
      const payment = paymentByUser.get(c.userId) ?? null;
      // No active version this cycle AND nothing settled → not on fixed-monthly
      // this month; drop it (mirrors the cron's `if (!activeVersion) continue`).
      if (monthly === 0 && !payment) continue;

      const advances = advancesByUser.get(c.userId) ?? 0;
      const netToPay = payment
        ? payment.amount
        : Math.max(0, monthly - advances);

      staff.push({
        user: {
          id: c.userId,
          firstName: c.user.firstName,
          lastName: c.user.lastName,
          position: c.user.position ?? c.user.roles[0]?.role.name ?? null,
          branch: c.user.branches[0]?.branch ?? null,
        },
        monthly,
        advances,
        netToPay,
        payment,
      });
    }

    // Sort by monthly magnitude desc, then name.
    staff.sort((a, b) => {
      if (b.monthly !== a.monthly) return b.monthly - a.monthly;
      const fn = a.user.firstName.localeCompare(b.user.firstName);
      return fn !== 0 ? fn : a.user.lastName.localeCompare(b.user.lastName);
    });

    const staffTotals = staff.reduce<StaffTotals>(
      (s, r) => ({
        monthly: s.monthly + r.monthly,
        advances: s.advances + r.advances,
        netToPay: s.netToPay + r.netToPay,
      }),
      { ...ZERO_TOTALS },
    );

    return { staff, staffTotals };
  }
}
