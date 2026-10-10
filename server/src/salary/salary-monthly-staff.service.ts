import { Injectable } from '@nestjs/common';
import { Prisma, SalaryPaymentStatus, SalaryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MonthlyScope } from './shared/resolve-monthly-scope';
import {
  FixedMonthlyVersion,
  prorateFixedMonthly,
} from './shared/prorate-fixed-monthly';
import { byWalkOrder, planShownAdvances } from './shared/advance-netting';
import { tashkentMonthKey } from '../common/date/tashkent';

/** One advance the payout nets (or netted), as the row's drawer lists it. */
export interface AdvanceItem {
  id: string;
  date: Date;
  amount: number;
  paymentMethod: 'CASH' | 'CARD';
  createdBy: { id: number; firstName: string; lastName: string } | null;
}

/**
 * What both monthly passes read of an advance. `createdAt` orders them like the
 * cron's walk does; `toAdvanceItem` drops it again.
 */
export const ADVANCE_SELECT = {
  id: true,
  amount: true,
  date: true,
  createdAt: true,
  paymentMethod: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.ExpenseSelect;

export function toAdvanceItem(e: AdvanceItem): AdvanceItem {
  const { id, date, amount, paymentMethod, createdBy } = e;
  return { id, date, amount, paymentMethod, createdBy };
}

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
    /**
     * Faol emas xodim bu ro'yxatda faqat oyi hali yopilmagan bo'lsa qoladi
     * (pastdagi "monthly === 0 && !payment" tashlab yuborishi) — shuning uchun
     * qatorga "Faol emas" belgisini qo'yish uchun kerak.
     */
    isActive: boolean;
    branch: { id: number; name: string } | null;
  };
  /** Prorated fixed-monthly salary for the period (full month = the flat value). */
  monthly: number;
  /** What this month's payout nets (ADR-0080): the planned walk, or what the payment settled. */
  advances: number;
  /** payment ? payment.amount (already net of advances) : max(0, monthly − advances). */
  netToPay: number;
  payment: {
    id: string;
    amount: number;
    status: SalaryPaymentStatus;
    paidAt: string | null;
  } | null;
  /** The advances `advances` sums — single-user calls only. */
  advanceItems?: AdvanceItem[];
}

export interface StaffTotals {
  monthly: number;
  advances: number;
  netToPay: number;
  /** How many advances `advances` nets. */
  advanceCount: number;
}

const ZERO_TOTALS: StaffTotals = {
  monthly: 0,
  advances: 0,
  netToPay: 0,
  advanceCount: 0,
};

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
      month,
      periodStart,
      periodEnd,
      nextMonthStart,
      periodStartLow,
      periodStartHigh,
      branchId,
      blocked,
      search,
      searchId,
      userId,
      staffBranchBasis,
    } = scope;
    // `home`: each staff member belongs to ONE branch, so a salary is never
    // counted under two. Read by the profit figures; the payroll page keeps
    // the default (everyone attached to the branch).
    const byHomeBranch = branchId !== undefined && staffBranchBasis === 'home';

    // 1. Non-teacher global FIXED_MONTHLY configs in branch scope.
    // isActive is NOT filtered: a staff member deactivated mid-cycle must still
    // receive their final (prorated) month — the version's `effectiveTo` bounds
    // the money, and the 4b cascade guarantees a deactivated config's version is
    // always closed (so future months prorate to 0). `deletedAt` is the hard
    // exclusion; `status` is deliberately NOT filtered so a TERMINATED-status
    // user still gets their worked days.
    //
    // Ular ro'yxatdan o'zi tushib qoladi, filtr bilan emas: oxirgi oyi
    // o'tgach `monthly === 0 && !payment` qatorni tashlab yuboradi (5-qadam).
    // Ya'ni "faqat faol xodimlar ko'rinsin" natijasi shu yerda puli qolganini
    // yo'qotmasdan hosil bo'ladi — bu ustozlar jadvalidagi qoida bilan bir xil
    // (`salary-monthly.service.ts`, Step 5+6 dagi filtr).
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
          ...(branchId !== undefined &&
            (byHomeBranch
              ? {
                  // Under AND: the search filter below owns `OR`.
                  AND: [
                    {
                      OR: [
                        { mainBranch: branchId },
                        { mainBranch: null, branches: { some: { branchId } } },
                      ],
                    },
                  ],
                }
              : { branches: { some: { branchId } } })),
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
            isActive: true,
            roles: { select: { role: { select: { name: true } } } },
            mainBranch: true,
            branches: {
              select: { branch: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    // Home branch = `mainBranch`, else the lowest branch the person is
    // attached to. The query above cannot express "lowest", so a person with
    // no main branch and several attachments is resolved here.
    const inScope = byHomeBranch
      ? configs.filter(
          (c) =>
            (c.user.mainBranch ??
              Math.min(...c.user.branches.map((b) => b.branch.id))) ===
            branchId,
        )
      : configs;
    if (inScope.length === 0) return { staff: [], staffTotals: ZERO_TOTALS };

    const configIds = inScope.map((c) => c.id);
    const userIds = inScope.map((c) => c.userId);

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

    // 3. Unsettled advances the payout would net (ADR-0080): everything dated
    // before the month's end that no payment has taken yet.
    const pendingRows = await this.prisma.expense.findMany({
      where: {
        relatedUserId: { in: userIds },
        category: 'TEACHER_ADVANCE',
        companyId,
        deletedAt: null,
        settledBySalaryPaymentId: null,
        date: { lt: nextMonthStart },
      },
      select: { ...ADVANCE_SELECT, relatedUserId: true },
    });
    const pendingByUser = new Map<number, typeof pendingRows>();
    for (const e of pendingRows) {
      const arr = pendingByUser.get(e.relatedUserId as number) ?? [];
      arr.push(e);
      pendingByUser.set(e.relatedUserId as number, arr);
    }

    // 4. Settled SalaryPayment bucketed into this month.
    const payments = await this.prisma.salaryPayment.findMany({
      where: {
        companyId,
        userId: { in: userIds },
        status: { not: SalaryPaymentStatus.CANCELLED },
        periodStart: { gte: periodStartLow, lt: periodStartHigh },
      },
      select: {
        id: true,
        userId: true,
        amount: true,
        status: true,
        paidAt: true,
        settledExpenses: { select: ADVANCE_SELECT },
      },
      orderBy: { createdAt: 'asc' },
    });
    const paymentByUser = new Map<
      number,
      {
        id: string;
        amount: number;
        status: SalaryPaymentStatus;
        paidAt: string | null;
        settled: (typeof payments)[number]['settledExpenses'];
      }
    >();
    for (const p of payments) {
      const prev = paymentByUser.get(p.userId);
      paymentByUser.set(p.userId, {
        id: p.id,
        amount: (prev?.amount ?? 0) + p.amount,
        status: p.status,
        paidAt: p.paidAt?.toISOString() ?? null,
        settled: [...(prev?.settled ?? []), ...p.settledExpenses],
      });
    }

    // 5. Build rows.
    const isOpenMonth = month === tashkentMonthKey(new Date());
    const staff: StaffRow[] = [];
    let advanceCount = 0;
    for (const c of inScope) {
      const monthly = prorateFixedMonthly(
        versByConfig.get(c.id) ?? [],
        periodStart,
        periodEnd,
      );
      const payment = paymentByUser.get(c.userId) ?? null;
      // No active version this cycle AND nothing settled → not on fixed-monthly
      // this month; drop it (mirrors the cron's `if (!activeVersion) continue`).
      if (monthly === 0 && !payment) continue;

      // A calculated month shows what its payment settled (a pending advance
      // never counts there — it is the next month's). The open month shows
      // every pending advance, uncapped; a past month without a payment what
      // the cron will net (`planShownAdvances`).
      const pending = pendingByUser.get(c.userId) ?? [];
      const plan = payment
        ? null
        : planShownAdvances(pending, monthly, nextMonthStart, isOpenMonth);
      const advanceList = payment
        ? [...payment.settled].sort(byWalkOrder)
        : plan!.settle.map((id) => pending.find((p) => p.id === id)!);
      const advances = payment
        ? advanceList.reduce((sum, a) => sum + a.amount, 0)
        : plan!.total;
      const netToPay = payment
        ? payment.amount
        : Math.max(0, monthly - advances);

      staff.push({
        user: {
          id: c.userId,
          firstName: c.user.firstName,
          lastName: c.user.lastName,
          position: c.user.position ?? c.user.roles[0]?.role.name ?? null,
          isActive: c.user.isActive,
          branch: c.user.branches[0]?.branch ?? null,
        },
        monthly,
        advances,
        netToPay,
        payment: payment
          ? {
              id: payment.id,
              amount: payment.amount,
              status: payment.status,
              paidAt: payment.paidAt,
            }
          : null,
        ...(userId !== undefined && {
          advanceItems: advanceList.map(toAdvanceItem),
        }),
      });
      advanceCount += advanceList.length;
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
        advanceCount: s.advanceCount,
      }),
      { ...ZERO_TOTALS, advanceCount },
    );

    return { staff, staffTotals };
  }
}
