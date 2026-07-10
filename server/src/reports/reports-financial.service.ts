import { Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePeriod } from '../common/finance/period-helpers';

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
/** Fallback floor when a company has no `systemStartDate` (May 2026 cutover). */
const DEBT_FLOOR_MONTH = '2026-05';
const UZ_MONTHS = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
];

/** Tashkent calendar month key ("YYYY-MM") of an instant. */
function tashkentMonthKey(d: Date): string {
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "May 2026" label for a "YYYY-MM" key. */
function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${UZ_MONTHS[m - 1]} ${y}`;
}

/** Inclusive list of "YYYY-MM" keys from `fromKey` to `toKey`. */
function enumerateMonths(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let [y, m] = fromKey.split('-').map(Number);
  const [ty, tm] = toKey.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/**
 * The exclusive UTC boundary marking the END of Tashkent month `monthKey` —
 * i.e. the first instant of the FOLLOWING Tashkent month. A transaction with
 * `createdAt >= this` happened strictly AFTER the month closed. (monthKey's
 * 1-based month equals the 0-based index of the next month, so `Date.UTC(y, m, 1)`
 * is already the next month's first day; subtract the offset for Tashkent midnight.)
 */
function tashkentMonthEndBoundary(monthKey: string): Date {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1) - TASHKENT_OFFSET_MS);
}

@Injectable()
export class ReportsFinancialService {
  constructor(private prisma: PrismaService) {}

  /**
   * Summary aggregate for the "yo'qolgan o'quvchi" debt write-off flow:
   * how much debt was forgiven in the selected period, broken into the
   * total amount and operation count. CEO sees the whole company; BD is
   * branch-scoped at the controller layer (pass `branchIds`).
   *
   * Defaults to the current calendar month when no period is given so the
   * Payments Overview KPI card has a sensible "this month" value.
   */
  async getDebtWriteOffsSummary(
    companyId: number,
    options: {
      branchId?: number;
      branchIds?: number[];
      startDate?: string;
      endDate?: string;
    } = {},
  ): Promise<{
    totalAmount: number;
    count: number;
    periodStart: string;
    periodEnd: string;
  }> {
    const now = new Date();
    const periodStart =
      options.startDate ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const periodEnd =
      options.endDate ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
      ).padStart(2, '0')}`;

    const where: Prisma.TransactionWhereInput = {
      companyId,
      type: TransactionType.DEBT_WRITE_OFF,
      reversedAt: null,
      createdAt: {
        gte: new Date(periodStart),
        lte: new Date(periodEnd + 'T23:59:59.999Z'),
      },
      ...(options.branchId && { branchId: options.branchId }),
      ...(options.branchIds &&
        options.branchIds.length > 0 && {
          branchId: { in: options.branchIds },
        }),
    };

    const agg = await this.prisma.transaction.aggregate({
      where,
      _sum: { amount: true },
      _count: true,
    });

    return {
      totalAmount: agg._sum.amount ?? 0,
      count: agg._count,
      periodStart,
      periodEnd,
    };
  }

  /**
   * Financial overview: expected vs actual income, salary, expenses.
   */
  async getFinancialOverview(
    companyId: number,
    query: { branchId?: number; startDate?: string; endDate?: string },
  ) {
    const now = new Date();
    const start =
      query.startDate ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const end =
      query.endDate ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;

    const dateFilter = {
      gte: new Date(start),
      lte: new Date(end + 'T23:59:59.999Z'),
    };

    const actualIncome = await this.prisma.payment.aggregate({
      where: {
        companyId,
        status: 'COMPLETED',
        createdAt: dateFilter,
        ...(query.branchId && { branchId: query.branchId }),
      },
      _sum: { amount: true },
      _count: true,
    });

    const incomeByMethod = await this.prisma.payment.groupBy({
      by: ['method'],
      where: {
        companyId,
        status: 'COMPLETED',
        createdAt: dateFilter,
        ...(query.branchId && { branchId: query.branchId }),
      },
      _sum: { amount: true },
      _count: true,
    });

    // Recognized revenue (actual): total lesson value billed to students in
    // the period — the sum of every LESSON_DEDUCTION prepaid batch. Unlike
    // recognizedRevenueForecast (a schedule-based projection), this is what
    // was really charged. Summing signed amounts nets reversed batches out,
    // since a reversal is itself a LESSON_DEDUCTION row with the opposite sign.
    const billedLessonsAgg = await this.prisma.transaction.aggregate({
      where: {
        companyId,
        type: 'LESSON_DEDUCTION',
        createdAt: dateFilter,
        ...(query.branchId && { branchId: query.branchId }),
      },
      _sum: { amount: true },
    });
    // Billing corrections (the April-cutover over-charge cleanup) were booked as
    // lump ADJUSTMENT rows, NOT as LESSON_DEDUCTION reversals. That means they
    // do not net out of the LESSON_DEDUCTION sum above and would leave recognized
    // revenue overstated by the phantom (double-billed) amount. Net them back in
    // here so a balance-only correction is reflected: a correction is recognized
    // in the period it was made (standard correction accounting). Only ADJUSTMENT
    // rows tagged `metadata.marker = 'overcharge*'` are billing corrections —
    // other ADJUSTMENTs (manual balance gifts, etc.) are intentionally excluded.
    const periodAdjustments = await this.prisma.transaction.findMany({
      where: {
        companyId,
        type: 'ADJUSTMENT',
        createdAt: dateFilter,
        ...(query.branchId && { branchId: query.branchId }),
      },
      select: { amount: true, metadata: true },
    });
    const overchargeCorrectionSum = periodAdjustments.reduce((sum, t) => {
      const marker = (t.metadata as { marker?: string } | null)?.marker;
      return typeof marker === 'string' && marker.startsWith('overcharge')
        ? sum + t.amount
        : sum;
    }, 0);
    const billedLessons = Math.abs(
      (billedLessonsAgg._sum.amount ?? 0) + overchargeCorrectionSum,
    );

    // Recognized revenue forecast: walks every active enrollment in scope
    // and estimates monthly recognition from the group's weekly cadence.
    //
    // Per-enrollment pricing falls back through three sources:
    //   1. Active Contract (studentId + groupId) — negotiated totalAmount /
    //      lessonPaymentCount, so chegirmali shartnomalar are priced
    //      exactly as agreed.
    //   2. Course.price × (100 - Student.discountPercent) / 100 — the
    //      per-student discount is the modern lever and is honored when no
    //      contract is on file.
    //   3. Course.price alone — defensive fallback if discountPercent is
    //      missing/null.
    //
    // Walking enrollments instead of contracts means production data without
    // any Contract rows (the common case today) still produces an honest
    // forecast — and centers that adopt contracts later get per-contract
    // pricing automatically for those enrollments, with the rest still
    // estimated from course price.
    const activeEnrollments = await this.prisma.enrollment.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        group: {
          deletedAt: null,
          statusEnum: 'ACTIVE',
          companyId,
          ...(query.branchId && { branchId: query.branchId }),
        },
      },
      select: {
        studentId: true,
        groupId: true,
        student: { select: { discountPercent: true } },
        group: {
          select: {
            exactDays: true,
            course: { select: { price: true, lessonPaymentCount: true } },
            contracts: {
              where: { status: 'ACTIVE', deletedAt: null },
              select: { studentId: true, totalAmount: true },
            },
          },
        },
      },
    });
    const recognizedRevenueForecast = activeEnrollments.reduce((sum, e) => {
      const lpc = e.group.course.lessonPaymentCount || 12;
      const lessonsPerMonth = (e.group.exactDays?.length ?? 0) * 4;
      const contract = e.group.contracts.find(
        (c) => c.studentId === e.studentId,
      );
      let perLesson: number;
      if (contract) {
        perLesson = Math.round(contract.totalAmount / lpc);
      } else {
        const discount = e.student?.discountPercent ?? 0;
        const fullPerLesson = Math.round(e.group.course.price / lpc);
        const clamped = Math.max(0, Math.min(100, discount));
        perLesson = Math.round((fullPerLesson * (100 - clamped)) / 100);
      }
      return sum + perLesson * lessonsPerMonth;
    }, 0);
    const expectedIncome = recognizedRevenueForecast;

    // Outstanding receivable (D.2): total unpaid balance across active
    // debtors. Not a forecast — it's what the center is actually owed today.
    const receivables = await this.prisma.student.aggregate({
      where: {
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
        balance: { lt: 0 },
      },
      _sum: { balance: true },
      _count: true,
    });
    const outstandingReceivable = Math.abs(receivables._sum.balance ?? 0);
    const debtorCount = receivables._count;
    const avgDebt =
      debtorCount > 0 ? Math.round(outstandingReceivable / debtorCount) : 0;

    // Salary: paid + pending. Both are reported on the same basis — the
    // dashboard number reflects what actually leaves (or will leave) the
    // center.
    const [salaryPaid, salaryPending] = await Promise.all([
      this.prisma.salaryPayment.aggregate({
        where: { companyId, status: 'PAID', paidAt: dateFilter },
        _sum: { amount: true },
      }),
      this.prisma.salaryAccrual.aggregate({
        where: { companyId, salaryPaymentId: null },
        _sum: { amount: true },
      }),
    ]);

    const pending = salaryPending._sum.amount ?? 0;

    const expenses = await this.prisma.expense.aggregate({
      where: {
        companyId,
        deletedAt: null,
        date: { gte: new Date(start), lte: new Date(end) },
        ...(query.branchId && { branchId: query.branchId }),
      },
      _sum: { amount: true },
    });

    // Teacher advances (TEACHER_ADVANCE) are never a generic Xarajat. Two
    // separate figures matter, on DIFFERENT dates:
    //   • advancesPaidInPeriod — cash handed to teachers this period. Used only
    //     to net the advance rows OUT of Xarajatlar (avanssiz). It is NOT an
    //     outflow on its own: an advance is a prepayment/receivable, not a cost.
    //   • advancesSettledInPeriod (below) — advances that became real salary
    //     cost this period by being netted against a PAID salary run. Only
    //     these are folded into "Ustoz oyliklari".
    // So an advance paid-but-not-yet-settled sits in NEITHER bucket → it is not
    // a Chiqim in the month it is handed out, and lands in salary the month it
    // settles. Lifetime cost stays correct (gross = net paid + settled advance).
    const teacherAdvances = await this.prisma.expense.aggregate({
      where: {
        companyId,
        deletedAt: null,
        category: 'TEACHER_ADVANCE',
        date: { gte: new Date(start), lte: new Date(end) },
        ...(query.branchId && { branchId: query.branchId }),
      },
      _sum: { amount: true },
    });

    // Advances recognized as salary cost this period: settled against a
    // SalaryPayment that was PAID inside the window (settlement-based).
    const settledAdvances = await this.prisma.expense.aggregate({
      where: {
        companyId,
        deletedAt: null,
        category: 'TEACHER_ADVANCE',
        settledBySalaryPayment: { status: 'PAID', paidAt: dateFilter },
        ...(query.branchId && { branchId: query.branchId }),
      },
      _sum: { amount: true },
    });

    const debtors = await this.prisma.student.count({
      where: {
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
        balance: { lt: 0 },
      },
    });

    const activeStudents = await this.prisma.student.aggregate({
      where: { companyId, deletedAt: null, status: 'ACTIVE' },
      _count: true,
      _sum: { balance: true },
    });

    // Active LTV: period revenue / unique payers in that period.
    const periodPayerFilter = {
      companyId,
      status: 'COMPLETED' as const,
      createdAt: dateFilter,
      ...(query.branchId && { branchId: query.branchId }),
    };
    const [periodPayerIncome, periodUniquePayers] = await Promise.all([
      this.prisma.payment.aggregate({
        where: periodPayerFilter,
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['studentId'],
        where: periodPayerFilter,
      }),
    ]);

    const marketingExpenses = await this.prisma.expense.aggregate({
      where: {
        companyId,
        deletedAt: null,
        category: 'MARKETING',
        date: { gte: new Date(start), lte: new Date(end) },
        ...(query.branchId && { branchId: query.branchId }),
      },
      _sum: { amount: true },
    });

    const newStudents = await this.prisma.student.count({
      where: {
        companyId,
        deletedAt: null,
        createdAt: dateFilter,
        ...(query.branchId && {
          branches: { some: { branchId: query.branchId } },
        }),
      },
    });

    const totalIncome = actualIncome._sum.amount ?? 0;
    const advancesPaidInPeriod = teacherAdvances._sum.amount ?? 0;
    const advancesSettledInPeriod = settledAdvances._sum.amount ?? 0;
    // Xarajatlar exclude advance cash entirely (avanssiz). Salary paid adds ONLY
    // the advances SETTLED this period — so an unsettled advance (cash out, not
    // yet salary) is in neither bucket and is not counted as a Chiqim/Foyda hit
    // this month; it lands in salary the month it settles. This keeps lifetime
    // cost correct without ever double-counting or losing the advance.
    const totalExpenseAmount = (expenses._sum.amount ?? 0) - advancesPaidInPeriod;
    const totalSalaryPaid =
      (salaryPaid._sum.amount ?? 0) + advancesSettledInPeriod;
    const totalExpenses = totalExpenseAmount + totalSalaryPaid;
    const marketingTotal = marketingExpenses._sum.amount ?? 0;
    const periodPayerTotal = periodPayerIncome._sum.amount ?? 0;
    const periodPayerCount = periodUniquePayers.length || 1;

    return {
      income: {
        expected: expectedIncome,
        actual: totalIncome,
        billed: billedLessons,
        paymentCount: actualIncome._count,
        byMethod: incomeByMethod.map((m) => ({
          method: m.method,
          amount: m._sum.amount ?? 0,
          count: m._count,
        })),
      },
      forecast: {
        recognizedRevenueForecast,
        outstandingReceivable,
        debtorExposure: { count: debtorCount, avgDebt },
      },
      salary: {
        paid: totalSalaryPaid,
        pending,
        // Portion of `paid` that came from advances SETTLED this period (so the
        // UI can show a "shundan avans" sub-line). Unsettled advances are not
        // here — they are not a Chiqim until they settle.
        advances: advancesSettledInPeriod,
      },
      expenses: totalExpenseAmount,
      netProfit: totalIncome - totalExpenses,
      debtorCount: debtors,
      activeBalance: activeStudents._sum.balance ?? 0,
      activeStudentCount: activeStudents._count,
      ltv: Math.round(periodPayerTotal / periodPayerCount),
      ltvPayerCount: periodUniquePayers.length,
      cac: newStudents > 0 ? Math.round(marketingTotal / newStudents) : 0,
      marketingRoi:
        marketingTotal > 0
          ? Math.round(((totalIncome - marketingTotal) / marketingTotal) * 100)
          : 0,
      avgPayment:
        actualIncome._count > 0
          ? Math.round(totalIncome / actualIncome._count)
          : 0,
      newStudentCount: newStudents,
      marketingExpenses: marketingTotal,
    };
  }

  /**
   * Monthly trend data for the last 6 months — used for KPI card charts.
   */
  async getFinancialTrend(companyId: number, branchId?: number) {
    const now = new Date();
    const months: { label: string; start: Date; end: Date }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(
        d.getFullYear(),
        d.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      const label = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      months.push({ label, start, end });
    }

    const branchFilter = branchId ? { branchId } : {};

    const result = await Promise.all(
      months.map(async (m) => {
        const dateFilter = { gte: m.start, lte: m.end };

        const [
          income,
          expenseAgg,
          salaryAgg,
          marketing,
          newStudents,
          payerCount,
          advancePaidAgg,
          advanceSettledAgg,
        ] = await Promise.all([
          this.prisma.payment.aggregate({
            where: {
              companyId,
              status: 'COMPLETED',
              createdAt: dateFilter,
              ...branchFilter,
            },
            _sum: { amount: true },
            _count: true,
          }),
          this.prisma.expense.aggregate({
            where: {
              companyId,
              deletedAt: null,
              date: { gte: m.start, lte: m.end },
              ...branchFilter,
            },
            _sum: { amount: true },
          }),
          this.prisma.salaryPayment.aggregate({
            where: { companyId, status: 'PAID', paidAt: dateFilter },
            _sum: { amount: true },
          }),
          this.prisma.expense.aggregate({
            where: {
              companyId,
              deletedAt: null,
              category: 'MARKETING',
              date: { gte: m.start, lte: m.end },
              ...branchFilter,
            },
            _sum: { amount: true },
          }),
          this.prisma.student.count({
            where: { companyId, deletedAt: null, createdAt: dateFilter },
          }),
          this.prisma.payment.groupBy({
            by: ['studentId'],
            where: { companyId, status: 'COMPLETED', createdAt: dateFilter },
          }),
          // Advance cash paid this month — netted out of Xarajatlar (avanssiz).
          this.prisma.expense.aggregate({
            where: {
              companyId,
              deletedAt: null,
              category: 'TEACHER_ADVANCE',
              date: { gte: m.start, lte: m.end },
              ...branchFilter,
            },
            _sum: { amount: true },
          }),
          // Advance recognized as salary this month — settled against a PAID run.
          this.prisma.expense.aggregate({
            where: {
              companyId,
              deletedAt: null,
              category: 'TEACHER_ADVANCE',
              settledBySalaryPayment: { status: 'PAID', paidAt: dateFilter },
              ...branchFilter,
            },
            _sum: { amount: true },
          }),
        ]);

        const incomeTotal = income._sum.amount ?? 0;
        const expenseTotal = expenseAgg._sum.amount ?? 0;
        const salaryTotal = salaryAgg._sum.amount ?? 0;
        const marketingTotal = marketing._sum.amount ?? 0;
        const paymentCount = income._count;
        // Same avanssiz / settlement-based split as getFinancialOverview so the
        // drill-down chart matches the "Chiqimlar" KPI card: exclude advance
        // cash from Xarajatlar, add only the advances settled this month.
        const advancePaid = advancePaidAgg._sum.amount ?? 0;
        const advanceSettled = advanceSettledAgg._sum.amount ?? 0;
        const chiqimTotal =
          expenseTotal - advancePaid + salaryTotal + advanceSettled;

        return {
          month: m.label,
          income: incomeTotal,
          expenses: chiqimTotal,
          profit: incomeTotal - chiqimTotal,
          activeBalance: 0,
          ltv:
            payerCount.length > 0
              ? Math.round(incomeTotal / payerCount.length)
              : 0,
          cac: newStudents > 0 ? Math.round(marketingTotal / newStudents) : 0,
          marketingRoi:
            marketingTotal > 0
              ? Math.round(
                  ((incomeTotal - marketingTotal) / marketingTotal) * 100,
                )
              : 0,
          avgPayment:
            paymentCount > 0 ? Math.round(incomeTotal / paymentCount) : 0,
        };
      }),
    );

    return result;
  }

  /**
   * Yearly trend — one bucket per calendar year, from the company's
   * `systemStartDate` year (capped to the last 5 years) up to the current year.
   * Powers the Excel "Yillar kesimida" sheet; columns grow automatically as
   * years accumulate. Uses the SAME avanssiz income/expense split as
   * `getFinancialTrend` so a year total equals the sum of its months.
   */
  async getYearlyTrend(companyId: number, branchId?: number) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { systemStartDate: true },
    });
    const startYear = company?.systemStartDate
      ? company.systemStartDate.getFullYear()
      : currentYear;
    // Keep the block readable — at most the 5 most recent years.
    const firstYear = Math.max(startYear, currentYear - 4);
    const years: number[] = [];
    for (let y = firstYear; y <= currentYear; y++) years.push(y);

    const branchFilter = branchId ? { branchId } : {};

    return Promise.all(
      years.map(async (year) => {
        const start = new Date(year, 0, 1);
        const end = new Date(year, 11, 31, 23, 59, 59, 999);
        const dateFilter = { gte: start, lte: end };

        const [
          income,
          expenseAgg,
          salaryAgg,
          newStudents,
          payerCount,
          advancePaidAgg,
          advanceSettledAgg,
        ] = await Promise.all([
          this.prisma.payment.aggregate({
            where: {
              companyId,
              status: 'COMPLETED',
              createdAt: dateFilter,
              ...branchFilter,
            },
            _sum: { amount: true },
            _count: true,
          }),
          this.prisma.expense.aggregate({
            where: {
              companyId,
              deletedAt: null,
              date: { gte: start, lte: end },
              ...branchFilter,
            },
            _sum: { amount: true },
          }),
          this.prisma.salaryPayment.aggregate({
            where: { companyId, status: 'PAID', paidAt: dateFilter },
            _sum: { amount: true },
          }),
          this.prisma.student.count({
            where: { companyId, deletedAt: null, createdAt: dateFilter },
          }),
          this.prisma.payment.groupBy({
            by: ['studentId'],
            where: { companyId, status: 'COMPLETED', createdAt: dateFilter },
          }),
          this.prisma.expense.aggregate({
            where: {
              companyId,
              deletedAt: null,
              category: 'TEACHER_ADVANCE',
              date: { gte: start, lte: end },
              ...branchFilter,
            },
            _sum: { amount: true },
          }),
          this.prisma.expense.aggregate({
            where: {
              companyId,
              deletedAt: null,
              category: 'TEACHER_ADVANCE',
              settledBySalaryPayment: { status: 'PAID', paidAt: dateFilter },
              ...branchFilter,
            },
            _sum: { amount: true },
          }),
        ]);

        const incomeTotal = income._sum.amount ?? 0;
        const expenseTotal = expenseAgg._sum.amount ?? 0;
        const salaryTotal = salaryAgg._sum.amount ?? 0;
        const paymentCount = income._count;
        const advancePaid = advancePaidAgg._sum.amount ?? 0;
        const advanceSettled = advanceSettledAgg._sum.amount ?? 0;
        const chiqimTotal =
          expenseTotal - advancePaid + salaryTotal + advanceSettled;

        return {
          year,
          income: incomeTotal,
          expenses: chiqimTotal,
          profit: incomeTotal - chiqimTotal,
          newStudents,
          payerCount: payerCount.length,
          avgPayment:
            paymentCount > 0 ? Math.round(incomeTotal / paymentCount) : 0,
        };
      }),
    );
  }

  /**
   * "Oylik qarzdorlik + undirish" — per Tashkent calendar month (from the
   * company's `systemStartDate` floor to the current month), how much total
   * student debt the center CLOSED THAT MONTH WITH, and how much of that
   * cohort's debt has since been recovered (cash) or written off.
   *
   * COMPANY-WIDE and reconstructed from the append-only `Transaction` ledger
   * only — no snapshot table. `Student.balance` is a pure accumulator and past
   * ledger rows never change (corrections land at `createdAt = now()`), so each
   * past month-end figure is derivable AND stable:
   *   balanceAsOf(monthEnd)_i = Student.balance_i
   *                             − Σ(Transaction.amount WHERE studentId=i
   *                                 AND createdAt >= nextMonthStart)
   * The signed sum spans ALL types incl. reversed (they net themselves out), so
   * it reconciles exactly to the live balance — same trick as `getReconciliation`.
   *
   * Cohort = students with balanceAsOf(monthEnd) < 0, ANY status (a
   * frozen/expelled/archived debtor still owes money). Recovery is capped per
   * student at that month's debt (the system settles oldest-first, so a later
   * month's new debt never distorts an earlier month):
   *   recovered_i = min(debt_i, max(0, Σ PAYMENT.amount after monthEnd))
   * `DEBT_WRITE_OFF` is a separate column (forgiven, not cash) so the recovery
   * rate isn't inflated. remaining = closingDebt − recovered − writtenOff.
   */
  async getMonthlyDebtRecovery(companyId: number): Promise<{
    months: Array<{
      monthKey: string;
      label: string;
      closingDebt: number;
      debtorCount: number;
      recovered: number;
      writtenOff: number;
      remaining: number;
      recoveryRate: number;
    }>;
    totals: {
      closingDebt: number;
      recovered: number;
      writtenOff: number;
      remaining: number;
    };
  }> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { systemStartDate: true },
    });
    const floorKey = company?.systemStartDate
      ? tashkentMonthKey(company.systemStartDate)
      : DEBT_FLOOR_MONTH;
    const monthKeys = enumerateMonths(floorKey, tashkentMonthKey(new Date()));

    // Live balances for every student (any status, incl. archived debtors).
    const students = await this.prisma.student.findMany({
      where: { companyId },
      select: { id: true, balance: true },
    });

    const months: Array<{
      monthKey: string;
      label: string;
      closingDebt: number;
      debtorCount: number;
      recovered: number;
      writtenOff: number;
      remaining: number;
      recoveryRate: number;
    }> = [];
    const totals = {
      closingDebt: 0,
      recovered: 0,
      writtenOff: 0,
      remaining: 0,
    };

    for (const monthKey of monthKeys) {
      const { cohort } = await this.reconstructMonthCohort(
        companyId,
        monthKey,
        students,
      );
      const closingDebt = cohort.reduce((s, c) => s + c.monthEndDebt, 0);
      const recovered = cohort.reduce((s, c) => s + c.recovered, 0);
      const writtenOff = cohort.reduce((s, c) => s + c.writtenOff, 0);
      const remaining = closingDebt - recovered - writtenOff;
      const recoveryRate =
        closingDebt > 0
          ? Math.round((recovered / closingDebt) * 1000) / 10
          : 0;

      months.push({
        monthKey,
        label: monthLabel(monthKey),
        closingDebt,
        debtorCount: cohort.length,
        recovered,
        writtenOff,
        remaining,
        recoveryRate,
      });
      totals.closingDebt += closingDebt;
      totals.recovered += recovered;
      totals.writtenOff += writtenOff;
      totals.remaining += remaining;
    }

    return { months, totals };
  }

  /**
   * Shared month-end cohort reconstruction (see `getMonthlyDebtRecovery` for the
   * ledger math). Returns the `boundary` (first instant of the NEXT Tashkent
   * month) and the per-student cohort — everyone whose reconstructed month-end
   * balance was negative — with each student's monthEndDebt and the capped
   * recovered / writtenOff / remaining. Powers both the aggregate report and the
   * per-month drill-down detail. `students` (id+balance for the whole company)
   * is passed in so the caller can load it once and reuse across months.
   */
  private async reconstructMonthCohort(
    companyId: number,
    monthKey: string,
    students: Array<{ id: number; balance: number }>,
  ): Promise<{
    boundary: Date;
    cohort: Array<{
      id: number;
      monthEndDebt: number;
      recovered: number;
      writtenOff: number;
      remaining: number;
    }>;
  }> {
    const boundary = tashkentMonthEndBoundary(monthKey);

    // Σ signed amount AFTER month-end, per student → reconstruct closing balance.
    const movesAfter = await this.prisma.transaction.groupBy({
      by: ['studentId'],
      where: {
        companyId,
        studentId: { not: null },
        createdAt: { gte: boundary },
      },
      _sum: { amount: true },
    });
    const moveMap = new Map<number, number>();
    for (const m of movesAfter) {
      if (m.studentId != null) moveMap.set(m.studentId, m._sum.amount ?? 0);
    }

    const base: Array<{ id: number; debt: number }> = [];
    for (const s of students) {
      const balAsOf = s.balance - (moveMap.get(s.id) ?? 0);
      if (balAsOf < 0) base.push({ id: s.id, debt: -balAsOf });
    }
    if (base.length === 0) return { boundary, cohort: [] };

    const cohortIds = base.map((c) => c.id);
    const [payAgg, woAgg] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['studentId'],
        where: {
          companyId,
          studentId: { in: cohortIds },
          type: TransactionType.PAYMENT,
          createdAt: { gte: boundary },
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['studentId'],
        where: {
          companyId,
          studentId: { in: cohortIds },
          type: TransactionType.DEBT_WRITE_OFF,
          createdAt: { gte: boundary },
        },
        _sum: { amount: true },
      }),
    ]);
    const payMap = new Map<number, number>();
    for (const p of payAgg) {
      if (p.studentId != null) payMap.set(p.studentId, p._sum.amount ?? 0);
    }
    const woMap = new Map<number, number>();
    for (const w of woAgg) {
      if (w.studentId != null) woMap.set(w.studentId, w._sum.amount ?? 0);
    }

    const cohort = base.map((c) => {
      const recovered = Math.min(c.debt, Math.max(0, payMap.get(c.id) ?? 0));
      const writtenOff = Math.min(
        c.debt - recovered,
        Math.max(0, woMap.get(c.id) ?? 0),
      );
      return {
        id: c.id,
        monthEndDebt: c.debt,
        recovered,
        writtenOff,
        remaining: c.debt - recovered - writtenOff,
      };
    });
    return { boundary, cohort };
  }

  /**
   * Per-month drill-down for `/payments/debt-history`: WHO owed at that month's
   * end and how much, WHO paid since (recovered), and WHO/WHY/WHEN each debt was
   * written off. Cohort is the same ledger-reconstructed set as the aggregate
   * report (any status). Transaction lists are scoped to the cohort + month-end
   * boundary and capped (a school-scale month has ~hundreds of rows).
   */
  async getMonthDebtDetail(
    companyId: number,
    monthKey: string,
  ): Promise<{
    monthKey: string;
    label: string;
    totals: {
      closingDebt: number;
      recovered: number;
      writtenOff: number;
      remaining: number;
      debtorCount: number;
    };
    debtors: Array<{
      id: number;
      firstName: string;
      lastName: string;
      phone: string | null;
      groups: string[];
      monthEndDebt: number;
      recovered: number;
      writtenOff: number;
      remaining: number;
    }>;
    recoveredPayments: Array<{
      id: string;
      studentId: number | null;
      firstName: string;
      lastName: string;
      amount: number;
      method: string | null;
      createdAt: Date;
      performedBy: string | null;
    }>;
    writeOffs: Array<{
      id: string;
      studentId: number | null;
      firstName: string;
      lastName: string;
      amount: number;
      reason: string | null;
      performedBy: string | null;
      createdAt: Date;
    }>;
    truncated: boolean;
  }> {
    const LIST_CAP = 2000;
    const students = await this.prisma.student.findMany({
      where: { companyId },
      select: { id: true, balance: true },
    });
    const { boundary, cohort } = await this.reconstructMonthCohort(
      companyId,
      monthKey,
      students,
    );
    const cohortIds = cohort.map((c) => c.id);

    const totals = {
      closingDebt: cohort.reduce((s, c) => s + c.monthEndDebt, 0),
      recovered: cohort.reduce((s, c) => s + c.recovered, 0),
      writtenOff: cohort.reduce((s, c) => s + c.writtenOff, 0),
      remaining: cohort.reduce((s, c) => s + c.remaining, 0),
      debtorCount: cohort.length,
    };

    if (cohortIds.length === 0) {
      return {
        monthKey,
        label: monthLabel(monthKey),
        totals,
        debtors: [],
        recoveredPayments: [],
        writeOffs: [],
        truncated: false,
      };
    }

    const [enriched, payRows, woRows] = await Promise.all([
      this.prisma.student.findMany({
        where: { id: { in: cohortIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          enrollments: {
            where: { status: 'ACTIVE' },
            select: { group: { select: { name: true } } },
          },
        },
      }),
      this.prisma.transaction.findMany({
        where: {
          companyId,
          studentId: { in: cohortIds },
          type: TransactionType.PAYMENT,
          createdAt: { gte: boundary },
          reversedAt: null,
        },
        select: {
          id: true,
          studentId: true,
          amount: true,
          createdAt: true,
          student: { select: { firstName: true, lastName: true } },
          performedBy: { select: { firstName: true, lastName: true } },
          payment: { select: { method: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: LIST_CAP + 1,
      }),
      this.prisma.transaction.findMany({
        where: {
          companyId,
          studentId: { in: cohortIds },
          type: TransactionType.DEBT_WRITE_OFF,
          createdAt: { gte: boundary },
          reversedAt: null,
        },
        select: {
          id: true,
          studentId: true,
          amount: true,
          createdAt: true,
          description: true,
          metadata: true,
          student: { select: { firstName: true, lastName: true } },
          performedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: LIST_CAP + 1,
      }),
    ]);

    const enrichMap = new Map(enriched.map((e) => [e.id, e]));
    const fullName = (u: { firstName: string; lastName: string } | null) =>
      u ? `${u.firstName} ${u.lastName}`.trim() : null;

    const debtors = cohort
      .map((c) => {
        const e = enrichMap.get(c.id);
        return {
          id: c.id,
          firstName: e?.firstName ?? '',
          lastName: e?.lastName ?? '',
          phone: e?.phone ?? null,
          groups: e?.enrollments.map((en) => en.group.name) ?? [],
          monthEndDebt: c.monthEndDebt,
          recovered: c.recovered,
          writtenOff: c.writtenOff,
          remaining: c.remaining,
        };
      })
      .sort((a, b) => b.monthEndDebt - a.monthEndDebt);

    const truncated =
      payRows.length > LIST_CAP || woRows.length > LIST_CAP;

    const recoveredPayments = payRows.slice(0, LIST_CAP).map((t) => ({
      id: t.id,
      studentId: t.studentId,
      firstName: t.student?.firstName ?? '',
      lastName: t.student?.lastName ?? '',
      amount: t.amount,
      method: t.payment?.method ?? null,
      createdAt: t.createdAt,
      performedBy: fullName(t.performedBy),
    }));

    const writeOffs = woRows.slice(0, LIST_CAP).map((t) => {
      const meta = (t.metadata as { reason?: string } | null) ?? null;
      return {
        id: t.id,
        studentId: t.studentId,
        firstName: t.student?.firstName ?? '',
        lastName: t.student?.lastName ?? '',
        amount: t.amount,
        reason: meta?.reason ?? t.description ?? null,
        performedBy: fullName(t.performedBy),
        createdAt: t.createdAt,
      };
    });

    return {
      monthKey,
      label: monthLabel(monthKey),
      totals,
      debtors,
      recoveredPayments,
      writeOffs,
      truncated,
    };
  }

  /**
   * Reconciliation data for the Excel "Tekshiruv" sheet. COMPANY-WIDE by design:
   * student balances aren't cleanly branch-scoped, so scoping the roll-forward
   * per branch would break the foot. The sheet labels this "(kompaniya bo'yicha)".
   *
   *  • student roll-forward — closing = current Σ Student.balance; opening =
   *    closing − Σ(all student-ledger transactions in the period). Foots by
   *    construction, and breaks the period movement out by transaction type.
   *  • GL recon (H1 invariant) — Σ Student.balance must equal Σ Transaction.amount
   *    over student rows (all types, incl. reversed, which net themselves out).
   */
  async getReconciliation(
    companyId: number,
    query: { startDate?: string; endDate?: string },
  ) {
    const period = resolvePeriod(query.startDate, query.endDate);
    const tsFilter = { gte: period.start, lte: period.endTs };

    const [byType, storedAgg, ledgerAgg] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['type'],
        where: { companyId, studentId: { not: null }, createdAt: tsFilter },
        _sum: { amount: true },
      }),
      this.prisma.student.aggregate({
        where: { companyId },
        _sum: { balance: true },
      }),
      this.prisma.transaction.aggregate({
        where: { companyId, studentId: { not: null } },
        _sum: { amount: true },
      }),
    ]);

    const sumType = (t: TransactionType) =>
      byType.find((g) => g.type === t)?._sum.amount ?? 0;
    const activity = {
      payment: sumType(TransactionType.PAYMENT),
      lessonDeduction: sumType(TransactionType.LESSON_DEDUCTION),
      adjustment: sumType(TransactionType.ADJUSTMENT),
      refund: sumType(TransactionType.REFUND),
      initialBalance: sumType(TransactionType.INITIAL_BALANCE),
      writeOff: sumType(TransactionType.DEBT_WRITE_OFF),
      withdrawal: sumType(TransactionType.BALANCE_WITHDRAWAL),
    };
    const activityTotal = byType.reduce((s, g) => s + (g._sum.amount ?? 0), 0);
    const named = Object.values(activity).reduce((s, v) => s + v, 0);
    const closing = storedAgg._sum.balance ?? 0;
    const ledgerSum = ledgerAgg._sum.amount ?? 0;

    return {
      period: { start: period.startStr, end: period.endStr },
      student: {
        opening: closing - activityTotal,
        closing,
        activity: { ...activity, other: activityTotal - named },
        activityTotal,
      },
      gl: { storedBalanceSum: closing, ledgerSum, diff: closing - ledgerSum },
    };
  }

  /**
   * The financial overview for the equal-length period immediately BEFORE the
   * requested one — powers the "Joriy vs O'tgan davr" comparison on the Excel
   * summary. Branch scope follows `getFinancialOverview` (branchId only).
   */
  async getPriorPeriodSummary(
    companyId: number,
    query: { branchId?: number; startDate?: string; endDate?: string },
  ) {
    const period = resolvePeriod(query.startDate, query.endDate);
    const durationMs = period.endTs.getTime() - period.start.getTime();
    const prevEnd = new Date(period.start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return this.getFinancialOverview(companyId, {
      branchId: query.branchId,
      startDate: iso(prevStart),
      endDate: iso(prevEnd),
    });
  }
}
