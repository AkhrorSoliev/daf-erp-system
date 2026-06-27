import { Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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

    // Teacher advances (TEACHER_ADVANCE) are cash paid to teachers — they
    // belong under "Ustoz oyliklari", not generic Xarajatlar. Reclassify
    // (display-only): pull them OUT of the expenses bucket and fold them INTO
    // salary.paid below. The combined outflow (and netProfit) is unchanged —
    // only the split between the two buckets shifts.
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
    const advancesInPeriod = teacherAdvances._sum.amount ?? 0;
    // Expenses excluding advances (they move to salary); salary paid includes
    // advances. Their sum equals the old (allExpenses + netSalaryPaid), so the
    // Chiqimlar and Foyda totals are unchanged — only the split shifts.
    const totalExpenseAmount = (expenses._sum.amount ?? 0) - advancesInPeriod;
    const totalSalaryPaid = (salaryPaid._sum.amount ?? 0) + advancesInPeriod;
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
        // Portion of `paid` that came from TEACHER_ADVANCE expenses (so the
        // UI can show a "shundan avans" sub-line).
        advances: advancesInPeriod,
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
        ]);

        const incomeTotal = income._sum.amount ?? 0;
        const expenseTotal = expenseAgg._sum.amount ?? 0;
        const salaryTotal = salaryAgg._sum.amount ?? 0;
        const marketingTotal = marketing._sum.amount ?? 0;
        const paymentCount = income._count;

        return {
          month: m.label,
          income: incomeTotal,
          expenses: expenseTotal + salaryTotal,
          profit: incomeTotal - expenseTotal - salaryTotal,
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
}
