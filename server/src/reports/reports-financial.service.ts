import { Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePeriod } from '../common/finance/period-helpers';
import {
  branchIdWhere,
  isEmptyScope,
  studentBranchWhere,
  userBranchWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import {
  DEBT_FLOOR_MONTH,
  enumerateMonths,
  monthLabel,
  tashkentMonthEndBoundary,
  tashkentMonthKey,
} from './debt-history.util';

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
      branchIds: ReportBranchIds;
      startDate?: string;
      endDate?: string;
      // No default. The last `= { branchIds: null }` in the money reports: a
      // caller that passed nothing got every branch, which is precisely the
      // failure mode the required parameter exists to prevent.
    },
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
      // Both a `branchId` and a `branchIds` used to be spread here, the second
      // silently clobbering the first — the same class of bug the resolved
      // scope exists to make unrepresentable.
      ...branchIdWhere(options.branchIds),
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
    query: {
      /**
       * Resolved by `resolveReportBranchIds` at the HTTP boundary — the
       * caller's scope already intersected with the branch they picked.
       * `null` = every branch. Never take a bare `branchId` here again: the
       * three metrics below silently ignored it, so an empty Namangan showed
       * 27 748 684 so'm of Fargona debt across 177 Fargona debtors.
       */
      branchIds: ReportBranchIds;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const { branchIds } = query;
    // One filter per shape of row: money rows carry `branchId`; students carry
    // it on the `StudentBranch` join; employees on `mainBranch`/`UserBranch`.
    const branchFilter = branchIdWhere(branchIds);
    const studentFilter = studentBranchWhere(branchIds);
    const employeeFilter =
      branchIds === null ? {} : { user: userBranchWhere(branchIds) };
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
        ...branchFilter,
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
        ...branchFilter,
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
        ...branchFilter,
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
        ...branchFilter,
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

    // The `exactDays × 4` revenue forecast used to live here. It assumed every
    // month was four weeks (8–13% short on a five-week month) and was rebuilt
    // from whoever was ACTIVE at request time, so a student leaving on the 25th
    // was erased from the whole month and June and July both scored the same
    // figure. `ReportsService.getFinancialOverview` now folds in
    // `ReportsExpectationService.getMonthlyExpectation` instead — calendar-based
    // lesson value. Do not reintroduce a second forecast here.

    // Outstanding receivable (D.2): total unpaid balance across active
    // debtors. Not a forecast — it's what the center is actually owed today.
    const receivables = await this.prisma.student.aggregate({
      where: {
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
        balance: { lt: 0 },
        ...studentFilter,
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
    // Neither SalaryPayment nor SalaryAccrual carries a `branchId` — payroll is
    // per employee — so the branch has to come from the teacher. Without this a
    // branch view subtracted the WHOLE company's payroll from that branch's own
    // revenue, which is the opposite of the per-branch P&L rule in
    // `docs/branch-decisions.md`.
    const [salaryPaid, salaryPending] = await Promise.all([
      this.prisma.salaryPayment.aggregate({
        where: {
          companyId,
          status: 'PAID',
          paidAt: dateFilter,
          ...employeeFilter,
        },
        _sum: { amount: true },
      }),
      this.prisma.salaryAccrual.aggregate({
        where: { companyId, salaryPaymentId: null, ...employeeFilter },
        _sum: { amount: true },
      }),
    ]);

    const pending = salaryPending._sum.amount ?? 0;

    const expenses = await this.prisma.expense.aggregate({
      where: {
        companyId,
        deletedAt: null,
        date: { gte: new Date(start), lte: new Date(end) },
        ...branchFilter,
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
        ...branchFilter,
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
        ...branchFilter,
      },
      _sum: { amount: true },
    });

    const debtors = await this.prisma.student.count({
      where: {
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
        balance: { lt: 0 },
        ...studentFilter,
      },
    });

    const activeStudents = await this.prisma.student.aggregate({
      where: {
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
        ...studentFilter,
      },
      _count: true,
      _sum: { balance: true },
    });

    // Active LTV: period revenue / unique payers in that period.
    const periodPayerFilter = {
      companyId,
      status: 'COMPLETED' as const,
      createdAt: dateFilter,
      ...branchFilter,
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
        ...branchFilter,
      },
      _sum: { amount: true },
    });

    const newStudents = await this.prisma.student.count({
      where: {
        companyId,
        deletedAt: null,
        createdAt: dateFilter,
        ...studentFilter,
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
    const totalExpenseAmount =
      (expenses._sum.amount ?? 0) - advancesPaidInPeriod;
    const totalSalaryPaid =
      (salaryPaid._sum.amount ?? 0) + advancesSettledInPeriod;
    const totalExpenses = totalExpenseAmount + totalSalaryPaid;
    const marketingTotal = marketingExpenses._sum.amount ?? 0;
    const periodPayerTotal = periodPayerIncome._sum.amount ?? 0;
    const periodPayerCount = periodUniquePayers.length || 1;

    return {
      income: {
        // `expected` is written by `ReportsService.getFinancialOverview`, which
        // folds in the calendar-based month-end expectation. Zero here so a
        // caller reaching this service directly never sees a stale forecast.
        expected: 0,
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
   * Recognized (accrual) revenue for lessons HELD in [start, end): the full
   * per-lesson value of every BILLED lesson whose attendance date falls in the
   * window. Sums `metadata.perLessonCost` over live LESSON_CONSUMPTION rows
   * joined to their attendance (a consumption exists only for a paid lesson).
   *
   * Unlike cash income (Payment by `createdAt`), this isolates a month to its
   * OWN lessons: a late-paid lesson recognizes in the month it was HELD, and a
   * prepayment recognizes only as the future lessons are held. It pairs exactly
   * with the `covered` teacher salary (same lesson set), so the monthly profit
   * `recognizedRevenue − teacherSalary` is internally consistent — this is the
   * "dars tushumi" basis the Foyda card + Excel "Sof foyda" use.
   */
  async getRecognizedRevenue(
    companyId: number,
    {
      start,
      end,
      branchIds,
    }: { start: Date; end: Date; branchIds: ReportBranchIds },
  ): Promise<number> {
    // Attendance carries no branch of its own — it inherits the GROUP's, the
    // same stamp `SALARY_ACCRUAL` freezes. Both callers already passed
    // `branchIds`, but this signature read `branchId`, so the field was always
    // `undefined` and the filter silently vanished: a branch-filtered Foyda card
    // subtracted ONE branch's payroll from the WHOLE company's revenue.
    if (isEmptyScope(branchIds)) return 0;
    const atts = await this.prisma.attendance.findMany({
      where: {
        companyId,
        status: { in: ['PRESENT', 'LATE', 'ABSENT'] },
        date: { gte: start, lt: end },
        ...(branchIds && { group: { branchId: { in: branchIds } } }),
      },
      select: {
        id: true,
        group: {
          select: {
            course: { select: { price: true, lessonPaymentCount: true } },
          },
        },
      },
    });
    if (!atts.length) return 0;

    const attById = new Map(atts.map((a) => [a.id, a]));
    const attIds = atts.map((a) => a.id);
    let revenue = 0;
    // Chunk the `in` list — a month can hold several thousand attendances.
    for (let i = 0; i < attIds.length; i += 1000) {
      const cons = await this.prisma.transaction.findMany({
        where: {
          companyId,
          type: 'LESSON_CONSUMPTION',
          reversedAt: null,
          attendanceId: { in: attIds.slice(i, i + 1000) },
        },
        select: { attendanceId: true, metadata: true },
      });
      for (const c of cons) {
        const meta = c.metadata as { perLessonCost?: number } | null;
        let per = meta?.perLessonCost;
        if (per == null) {
          // Legacy rows without metadata: fall back to the group's course price.
          const a = c.attendanceId ? attById.get(c.attendanceId) : undefined;
          const lpc = a?.group?.course?.lessonPaymentCount || 12;
          per = a?.group?.course ? Math.round(a.group.course.price / lpc) : 0;
        }
        revenue += per;
      }
    }
    return revenue;
  }

  /**
   * Income composition for a period: how much of the cash received in
   * [start, end] is REAL income for the period's own month(s) versus LATE
   * payments that settled debt carried in from earlier months — broken down by
   * WHICH earlier month. Powers the drill-down inside the "Tushumlar" KPI card.
   *
   * Definition (balance/debt-based FIFO, chosen by the CEO): a payment is
   * "late" only to the extent it reduced a NEGATIVE student balance at the
   * instant it landed. The debt it cleared is aged OLDEST-FIRST across the
   * months in which those debit rows actually hit the balance (their
   * `createdAt` Tashkent month). Anything a payment does beyond clearing a
   * pre-period debt — settling a same-period charge, or sitting as advance — is
   * REAL income for the current period.
   *
   * Reconstructed from the append-only ledger by replaying each payer's
   * EFFECTIVE ledger: rows still in force (`reversedAt IS NULL AND
   * reversedTransactionId IS NULL`). A reversed row and its reversal net to
   * zero, so dropping both keeps the running balance exactly equal to
   * `Student.balance` (same invariant `getReconciliation` relies on). A FIFO
   * queue of unsettled debit fragments — each tagged by its Tashkent month — is
   * consumed by every credit; only the credits that are COMPLETED PAYMENTs
   * inside the period (and branch) are tallied. Because each such payment's
   * FULL amount lands in exactly one bucket (late[month] or current), the parts
   * sum EXACTLY to the period's `income.actual` (the Tushumlar card figure).
   *
   * Debt aging is company-wide (a student's balance isn't cleanly
   * branch-scoped, same stance as `getMonthlyDebtRecovery`), but the TALLIED
   * payments honor `branchId` so the total still reconciles with a
   * branch-filtered card in the common (single-branch-per-student) case.
   */
  async getIncomeMonthAttribution(
    companyId: number,
    query: {
      branchIds: ReportBranchIds;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<{
    period: { start: string; end: string };
    monthKey: string;
    currentLabel: string;
    total: number;
    currentMonth: number;
    lateTotal: number;
    late: Array<{ monthKey: string; label: string; amount: number }>;
    payerCount: number;
    lessonsValue: number;
    collectionPct: number | null;
  }> {
    // Normalised once: the in-memory attribution leg below compares against it
    // directly, and `undefined` there would silently reject every credit.
    const branchIds = query.branchIds ?? null;
    const period = resolvePeriod(query.startDate, query.endDate);
    const boundaryKey = tashkentMonthKey(period.start);
    const startMs = period.start.getTime();
    const endMs = period.endTs.getTime();

    // The "current" bucket spans every month INSIDE the selected range (late is
    // strictly the months BEFORE it). Label single-month ranges "Iyun 2026" and
    // multi-month ranges ("Bu yil", "Oxirgi 3 oy") "Yanvar 2026 – Iyun 2026" so
    // the panel never calls a whole-year bucket "shu oy". Use the midnight end
    // date (not endTs) so a month-last-day + Tashkent offset doesn't roll over.
    const endMonthKey = tashkentMonthKey(new Date(period.endStr));
    const currentLabel =
      endMonthKey === boundaryKey
        ? monthLabel(boundaryKey)
        : `${monthLabel(boundaryKey)} – ${monthLabel(endMonthKey)}`;

    // The collection denominator: what the period's OWN lessons were worth.
    // `Attendance.date` is `@db.Date`, so the upper bound must be an unshifted
    // UTC date and EXCLUSIVE — the H3 boundary rule (a `lte` end-of-day
    // timestamp truncates back onto the last day and counts it twice).
    const lessonsValue = await this.getRecognizedRevenue(companyId, {
      start: period.start,
      end: new Date(period.endDate.getTime() + 86_400_000),
      branchIds,
    });
    const empty = {
      period: { start: period.startStr, end: period.endStr },
      monthKey: boundaryKey,
      currentLabel,
      total: 0,
      currentMonth: 0,
      lateTotal: 0,
      late: [] as Array<{ monthKey: string; label: string; amount: number }>,
      payerCount: 0,
      lessonsValue,
      collectionPct: lessonsValue > 0 ? 0 : null,
    };

    // Only students who received a COMPLETED payment in the period+branch need
    // their ledger replayed — everyone else contributes nothing to this window.
    const periodPayers = await this.prisma.payment.groupBy({
      by: ['studentId'],
      where: {
        companyId,
        status: 'COMPLETED',
        createdAt: { gte: period.start, lte: period.endTs },
        ...branchIdWhere(branchIds),
      },
    });
    const payerIds = periodPayers
      .map((p) => p.studentId)
      .filter((id): id is number => id != null);
    if (payerIds.length === 0) return empty;

    // Effective ledger for every payer, chronological. Reversed originals AND
    // their reversal rows are both excluded so the replay balance stays equal
    // to Student.balance. `id` is only a same-timestamp tiebreak.
    const rows = await this.prisma.transaction.findMany({
      where: {
        companyId,
        studentId: { in: payerIds },
        reversedAt: null,
        reversedTransactionId: null,
      },
      select: {
        studentId: true,
        type: true,
        amount: true,
        branchId: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    // Bucket per student, preserving the chronological order above.
    const byStudent = new Map<number, typeof rows>();
    for (const r of rows) {
      if (r.studentId == null) continue;
      const list = byStudent.get(r.studentId);
      if (list) list.push(r);
      else byStudent.set(r.studentId, [r]);
    }

    const lateByMonth = new Map<string, number>();
    let currentMonth = 0;

    for (const list of byStudent.values()) {
      // Running ledger state per student:
      //  • `queue` — FIFO fragments of OUTSTANDING debt (oldest at `head`).
      //  • `prepaid` — the student's standing POSITIVE balance (advances).
      // Invariant after each row: prepaid > 0 ⟹ queue is empty, and the queue's
      // outstanding sum === max(0, -runningBalance). This is what makes the
      // split honor the definition ("late only to the extent it reduced a
      // NEGATIVE balance"): a debit an advance already covered never becomes a
      // phantom obligation, so an on-time prepaid payment (pay a cycle up front,
      // the LESSON_DEDUCTION follows) lands in `currentMonth`, not "late".
      const queue: Array<{ monthKey: string; remaining: number }> = [];
      let head = 0;
      let prepaid = 0;

      for (const r of list) {
        if (r.amount < 0) {
          // A debit — first netted against standing advance; only the uncovered
          // remainder becomes an obligation tagged by the month it hit.
          let debit = -r.amount;
          const absorbed = Math.min(prepaid, debit);
          prepaid -= absorbed;
          debit -= absorbed;
          if (debit > 0) {
            queue.push({
              monthKey: tashkentMonthKey(r.createdAt),
              remaining: debit,
            });
          }
          continue;
        }
        if (r.amount === 0) continue; // LESSON_CONSUMPTION — no balance movement.

        // A credit settles the oldest outstanding obligations first. Only an
        // in-period, in-branch COMPLETED PAYMENT is tallied; every other credit
        // (out-of-period payment, positive adjustment, initial balance) still
        // consumes the queue so the debt aging stays correct.
        let credit = r.amount;
        const ts = r.createdAt.getTime();
        const attribute =
          r.type === 'PAYMENT' &&
          ts >= startMs &&
          ts <= endMs &&
          // In-memory leg of the same scope: a credit from ANOTHER branch still
          // ages this student's debt, but is not this branch's income.
          (branchIds === null ||
            (r.branchId != null && branchIds.includes(r.branchId)));

        while (credit > 0 && head < queue.length) {
          const frag = queue[head];
          const taken = Math.min(credit, frag.remaining);
          frag.remaining -= taken;
          credit -= taken;
          if (attribute) {
            if (frag.monthKey < boundaryKey) {
              lateByMonth.set(
                frag.monthKey,
                (lateByMonth.get(frag.monthKey) ?? 0) + taken,
              );
            } else {
              currentMonth += taken;
            }
          }
          if (frag.remaining === 0) head++;
        }
        // Leftover credit beyond all outstanding debt is advance: retain it as
        // standing balance so it absorbs FUTURE debits (else next month's
        // deduction would look like a phantom debt the following payment settles
        // "late"). Tally it as current income only when it's a payment in scope.
        if (credit > 0) {
          if (attribute) currentMonth += credit;
          prepaid += credit;
        }
      }
    }

    const late = Array.from(lateByMonth.entries())
      .map(([monthKey, amount]) => ({
        monthKey,
        label: monthLabel(monthKey),
        amount,
      }))
      // Most recent prior month first (e.g. May before April before March).
      .sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1));
    const lateTotal = late.reduce((s, m) => s + m.amount, 0);

    return {
      period: { start: period.startStr, end: period.endStr },
      monthKey: boundaryKey,
      currentLabel,
      total: currentMonth + lateTotal,
      currentMonth,
      lateTotal,
      late,
      payerCount: payerIds.length,
      lessonsValue,
      // "N% yig'ildi" with a MEANING: of the lessons actually HELD in this
      // window, how much did the period's OWN cash cover? Both sides belong to
      // the same window — old-debt settlement is excluded from the numerator
      // (it is income for the month it was billed in) and future months
      // contribute no lessons to the denominator. Unlike `cash ÷ forecast` it
      // contains no schedule guess, and unlike `currentMonth ÷ total` the
      // denominator is not the numerator's own parent.
      //
      // It CAN legitimately exceed 100%: a cycle prepaid in full is this
      // period's income against lessons that will be held next month. That is a
      // real signal (prepayment), not the old artefact where the denominator
      // was simply 11% too small every month.
      collectionPct:
        lessonsValue > 0
          ? Math.round((currentMonth / lessonsValue) * 100)
          : null,
    };
  }

  /**
   * Monthly trend data for the last 6 months — used for KPI card charts.
   */
  async getFinancialTrend(companyId: number, branchIds: ReportBranchIds) {
    const now = new Date();
    const months: {
      label: string;
      monthKey: string;
      start: Date;
      end: Date;
    }[] = [];

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
      // `YYYY-MM` alongside the display label so callers can ask for the
      // canonical per-month figure without re-parsing `MM/YYYY`.
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ label, monthKey, start, end });
    }

    const branchFilter = branchIdWhere(branchIds);
    // The count legs (new students, unique payers) and the payroll leg carry
    // the branch somewhere OTHER than on their own row, and all three were left
    // unscoped — so a branch series plotted its own money against the whole
    // company's headcount. Namangan's 2026 row read 0 / 0 / 0 for money beside
    // "715 new students, 551 payers".
    const studentFilter = studentBranchWhere(branchIds);
    const employeeFilter =
      branchIds === null ? {} : { user: userBranchWhere(branchIds) };

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
            where: {
              companyId,
              status: 'PAID',
              paidAt: dateFilter,
              ...employeeFilter,
            },
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
            where: {
              companyId,
              deletedAt: null,
              createdAt: dateFilter,
              ...studentFilter,
            },
          }),
          this.prisma.payment.groupBy({
            by: ['studentId'],
            where: {
              companyId,
              status: 'COMPLETED',
              createdAt: dateFilter,
              ...branchFilter,
            },
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
          monthKey: m.monthKey,
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
  async getYearlyTrend(companyId: number, branchIds: ReportBranchIds) {
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

    const branchFilter = branchIdWhere(branchIds);
    // The count legs (new students, unique payers) and the payroll leg carry
    // the branch somewhere OTHER than on their own row, and all three were left
    // unscoped — so a branch series plotted its own money against the whole
    // company's headcount. Namangan's 2026 row read 0 / 0 / 0 for money beside
    // "715 new students, 551 payers".
    const studentFilter = studentBranchWhere(branchIds);
    const employeeFilter =
      branchIds === null ? {} : { user: userBranchWhere(branchIds) };

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
            where: {
              companyId,
              status: 'PAID',
              paidAt: dateFilter,
              ...employeeFilter,
            },
            _sum: { amount: true },
          }),
          this.prisma.student.count({
            where: {
              companyId,
              deletedAt: null,
              createdAt: dateFilter,
              ...studentFilter,
            },
          }),
          this.prisma.payment.groupBy({
            by: ['studentId'],
            where: {
              companyId,
              status: 'COMPLETED',
              createdAt: dateFilter,
              ...branchFilter,
            },
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
  async getMonthlyDebtRecovery(
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<{
    months: Array<{
      monthKey: string;
      label: string;
      closingDebt: number;
      debtorCount: number;
      recovered: number;
      writtenOff: number;
      remaining: number;
      remainingDebtorCount: number;
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
    // Scoping this ONE query scopes the whole report: the cohort, the recovery
    // tally and the drill-down lists all filter on the ids it returns. The
    // report used to be company-wide by omission, so a Branch Director's
    // drill-down listed the other branch's debtors by name and phone.
    const students = await this.prisma.student.findMany({
      where: { companyId, ...studentBranchWhere(scope) },
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
      remainingDebtorCount: number;
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
      // How many of that month's debtors STILL owe (recovered + written-off has
      // not cleared them). Distinct from `debtorCount` (everyone who CLOSED the
      // month with debt) — a debtor who has since fully paid drops out here.
      const remainingDebtorCount = cohort.filter((c) => c.remaining > 0).length;
      const recoveryRate =
        closingDebt > 0 ? Math.round((recovered / closingDebt) * 1000) / 10 : 0;

      months.push({
        monthKey,
        label: monthLabel(monthKey),
        closingDebt,
        debtorCount: cohort.length,
        recovered,
        writtenOff,
        remaining,
        remainingDebtorCount,
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
      // Write-off is claimed FIRST: it is an explicit act naming this debt,
      // while the payment attribution is inferred from oldest-first settlement.
      // The other order let a debtor who also paid absorb the whole cap, and
      // their forgiveness vanished from the column — 2.43 mln so'm of real
      // write-offs were reported as 0.43 mln.
      const writtenOff = Math.min(c.debt, Math.max(0, woMap.get(c.id) ?? 0));
      const recovered = Math.min(
        c.debt - writtenOff,
        Math.max(0, payMap.get(c.id) ?? 0),
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
    scope: ReportBranchIds,
  ): Promise<{
    monthKey: string;
    label: string;
    totals: {
      closingDebt: number;
      recovered: number;
      writtenOff: number;
      remaining: number;
      debtorCount: number;
      /** What this same cohort owes TODAY — the figure `remaining` is NOT. */
      debtNow: number;
      debtorsNow: number;
      /**
       * How many of the cohort's PEOPLE later paid / were forgiven. The lists
       * below are rows, not people, and the two are wildly different (June
       * 2026: 310 payment rows from 178 students). Without these the UI can
       * only show row counts beside a headcount, which reads as "310 of the
       * 352 paid" — a claim nobody made.
       */
      payerCount: number;
      forgivenCount: number;
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
      /** Live balance, so the frozen figure can be read against today's. */
      currentDebt: number;
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
      /** The original of a payment that was later rolled back. */
      isReversed: boolean;
      /** The counter-row itself (negative amount). */
      isReversal: boolean;
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
      isReversed: boolean;
      isReversal: boolean;
    }>;
    truncated: boolean;
  }> {
    const LIST_CAP = 2000;
    // Scoping this ONE query scopes the whole report: the cohort, the recovery
    // tally and the drill-down lists all filter on the ids it returns. The
    // report used to be company-wide by omission, so a Branch Director's
    // drill-down listed the other branch's debtors by name and phone.
    const students = await this.prisma.student.findMany({
      where: { companyId, ...studentBranchWhere(scope) },
      select: { id: true, balance: true },
    });
    const { boundary, cohort } = await this.reconstructMonthCohort(
      companyId,
      monthKey,
      students,
    );
    const cohortIds = cohort.map((c) => c.id);
    const balanceNow = new Map(students.map((s) => [s.id, s.balance]));
    const liveDebt = (id: number) => {
      const bal = balanceNow.get(id) ?? 0;
      return bal < 0 ? -bal : 0;
    };

    const totals = {
      closingDebt: cohort.reduce((s, c) => s + c.monthEndDebt, 0),
      recovered: cohort.reduce((s, c) => s + c.recovered, 0),
      writtenOff: cohort.reduce((s, c) => s + c.writtenOff, 0),
      remaining: cohort.reduce((s, c) => s + c.remaining, 0),
      debtorCount: cohort.length,
      // `remaining` answers "how much of THAT month's debt is unpaid"; this
      // answers "what do these people owe now". They diverge by every so'm of
      // debt the cohort has taken on since, and reading one as the other is the
      // single biggest misreading this page invited.
      debtNow: cohort.reduce((s, c) => s + liveDebt(c.id), 0),
      debtorsNow: cohort.filter((c) => liveDebt(c.id) > 0).length,
      payerCount: 0,
      forgivenCount: 0,
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

    // Headcounts, computed by grouping rather than by de-duplicating the capped
    // lists below — a month past LIST_CAP would otherwise undercount silently.
    // Net sum > 0 so a student whose only payment was fully reversed is not
    // counted as having paid.
    const [payerGroups, forgivenGroups] = await Promise.all([
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
    totals.payerCount = payerGroups.filter(
      (g) => (g._sum.amount ?? 0) > 0,
    ).length;
    totals.forgivenCount = forgivenGroups.filter(
      (g) => (g._sum.amount ?? 0) > 0,
    ).length;

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
      // NO reversal filter, deliberately. `reverseTransaction` writes its
      // counter-row with the ORIGINAL's type and `reversedAt: null`, so
      // `reversedAt: null` here kept the undo and dropped the payment it undid
      // — the list then showed bare negative rows and no longer summed to the
      // aggregate above (6 such rows in May alone). Both halves are returned,
      // flagged, and net to zero exactly like the aggregate.
      this.prisma.transaction.findMany({
        where: {
          companyId,
          studentId: { in: cohortIds },
          type: TransactionType.PAYMENT,
          createdAt: { gte: boundary },
        },
        select: {
          id: true,
          studentId: true,
          amount: true,
          createdAt: true,
          reversedAt: true,
          reversedTransactionId: true,
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
        },
        select: {
          id: true,
          studentId: true,
          amount: true,
          createdAt: true,
          description: true,
          metadata: true,
          reversedAt: true,
          reversedTransactionId: true,
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
          currentDebt: liveDebt(c.id),
        };
      })
      .sort((a, b) => b.monthEndDebt - a.monthEndDebt);

    const truncated = payRows.length > LIST_CAP || woRows.length > LIST_CAP;

    const recoveredPayments = payRows.slice(0, LIST_CAP).map((t) => ({
      id: t.id,
      studentId: t.studentId,
      firstName: t.student?.firstName ?? '',
      lastName: t.student?.lastName ?? '',
      amount: t.amount,
      method: t.payment?.method ?? null,
      createdAt: t.createdAt,
      performedBy: fullName(t.performedBy),
      isReversed: t.reversedAt != null,
      isReversal: t.reversedTransactionId != null,
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
        isReversed: t.reversedAt != null,
        isReversal: t.reversedTransactionId != null,
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
   * Reconciliation data for the Excel "Tekshiruv" sheet.
   *
   * Scoped to the workbook's branch like every other sheet. It used to be
   * company-wide unconditionally, so a branch-filtered export footed its
   * reconciliation against every branch's ledger — a green tick that proved
   * nothing about the branch the cover page named.
   *
   *  • student roll-forward — closing = current Σ Student.balance; opening =
   *    closing − Σ(all student-ledger transactions in the period). Foots by
   *    construction, and breaks the period movement out by transaction type.
   *  • GL recon (H1 invariant) — Σ Student.balance must equal Σ Transaction.amount
   *    over student rows (all types, incl. reversed, which net themselves out).
   */
  async getReconciliation(
    companyId: number,
    query: {
      branchIds: ReportBranchIds;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const period = resolvePeriod(query.startDate, query.endDate);
    const tsFilter = { gte: period.start, lte: period.endTs };
    // Was company-wide unconditionally: a branch-filtered workbook footed its
    // Tekshiruv sheet against every branch's ledger.
    const branchFilter = branchIdWhere(query.branchIds);
    const studentFilter = studentBranchWhere(query.branchIds);

    // All three legs take the SAME scope, so the roll-forward still foots:
    // closing (student balances) − activity (their ledger rows) = opening.
    // Ledger rows are branch-stamped and students branch-joined, so a branch's
    // balances and its own transactions line up.
    const [byType, storedAgg, ledgerAgg] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['type'],
        where: {
          companyId,
          studentId: { not: null },
          createdAt: tsFilter,
          ...branchFilter,
        },
        _sum: { amount: true },
      }),
      this.prisma.student.aggregate({
        where: { companyId, ...studentFilter },
        _sum: { balance: true },
      }),
      this.prisma.transaction.aggregate({
        where: { companyId, studentId: { not: null }, ...branchFilter },
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
   * Period outflows/losses that neither `getFinancialOverview.netProfit` nor
   * `getProfitLoss.netProfit` subtract today — the missing pieces the CEO's
   * "aniq sof foyda" needs. All read-only aggregates:
   *
   *  • refunds       — cash physically returned to students (REFUND ledger rows,
   *                    active only). A real cash outflow. `Payment` stays
   *                    COMPLETED on a refund, so revenue is not reduced either →
   *                    a pure un-subtracted outflow.
   *  • writeOffs     — forgiven student debt (DEBT_WRITE_OFF). Non-cash, but a
   *                    real loss of company value (uncollectable receivable).
   *  • providerFees  — gateway (Payme/Click) commission retained from the inflow
   *                    (`Payment.providerFee`). Income counts the GROSS amount,
   *                    so the fee is money the center never receives.
   *
   * Refund/write-off are student-ledger rows that don't carry a reliable
   * branchId, so they are company-wide (like `getReconciliation`); a branchId
   * filter is applied only to the gateway-fee (Payment) leg, which is branch-
   * scoped. The Excel net-profit block is company-wide in the common case.
   */
  async getPeriodOutflows(
    companyId: number,
    query: {
      branchIds: ReportBranchIds;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const period = resolvePeriod(query.startDate, query.endDate);
    const tsFilter = { gte: period.start, lte: period.endTs };
    const branchFilter = branchIdWhere(query.branchIds);

    const [refundRows, writeOffAgg, providerFeeAgg] = await Promise.all([
      // Active (non-reversed) REFUND rows — signed negative on the student
      // ledger; take the magnitude of cash returned.
      // Branch-filtered since every ledger row now carries a branch (and the
      // historical rows were backfilled) — a branch's own refunds and
      // write-offs, not the company's, must reduce its profit.
      this.prisma.transaction.findMany({
        where: {
          companyId,
          type: TransactionType.REFUND,
          reversedAt: null,
          createdAt: tsFilter,
          ...branchFilter,
        },
        select: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          companyId,
          type: TransactionType.DEBT_WRITE_OFF,
          reversedAt: null,
          createdAt: tsFilter,
          ...branchFilter,
        },
        _sum: { amount: true },
      }),
      // Gateway commission actually kept by Payme/Click on COMPLETED payments.
      this.prisma.payment.aggregate({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: tsFilter,
          ...branchFilter,
        },
        _sum: { providerFee: true },
      }),
    ]);

    const refunds = Math.abs(refundRows.reduce((s, t) => s + t.amount, 0));
    const writeOffs = Math.abs(writeOffAgg._sum.amount ?? 0);
    const providerFees = providerFeeAgg._sum.providerFee ?? 0;

    return {
      period: { start: period.startStr, end: period.endStr },
      refunds,
      writeOffs,
      providerFees,
    };
  }

  /**
   * The financial overview for the equal-length period immediately BEFORE the
   * requested one — powers the "Joriy vs O'tgan davr" comparison on the Excel
   * summary. Takes the SAME resolved scope as `getFinancialOverview`, so the
   * two columns of that comparison can never be read on different bases.
   */
  async getPriorPeriodSummary(
    companyId: number,
    query: {
      branchIds: ReportBranchIds;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const period = resolvePeriod(query.startDate, query.endDate);
    const durationMs = period.endTs.getTime() - period.start.getTime();
    const prevEnd = new Date(period.start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return this.getFinancialOverview(companyId, {
      branchIds: query.branchIds,
      startDate: iso(prevStart),
      endDate: iso(prevEnd),
    });
  }
}
