/**
 * Input assembly for the ten-sheet "Hisobot" workbook — the step between
 * "figures fetched" and "sheets rendered".
 *
 * It lives outside reports-excel.service.ts so that file stays what it claims
 * to be: fetch the facade, then call the builders. Everything here is either
 * pure or a thin fan-out over `ReportsService`; there is no Prisma access, the
 * same rule the service itself obeys.
 *
 * The shapes produced (`SummaryInput`, `MonthRow`, `BranchRow`) are the
 * contracts of the sheet builders — see reports-excel.{summary,trend}-sheet.ts.
 */
import { ReportsService } from './reports.service';
import {
  NetProfit,
  buildNetProfit,
  EXPENSE_LABELS,
} from './reports-excel.helpers';
import {
  aggregatableMonths,
  sumMonthlySalaries,
} from './reports-excel.month-range';
import { SummaryInput } from './reports-excel.summary-sheet';
import { MonthRow, BranchRow } from './reports-excel.trend-sheets';
import { uzMonthLabel } from './reports-excel.v2-helpers';
import { StudentFlow } from './reports-student-flow.service';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';

/** One month's own-profit block, exactly as the facade returns it. */
export type OwnMonthProfit = Awaited<
  ReturnType<ReportsService['getOwnMonthProfit']>
>;

/** 'YYYY-MM' shifted by whole calendar months. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Inclusive last-day bound for a 'YYYY-MM'. */
export function monthEndDate(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

/**
 * The single authoritative "Sof foyda" for the selected period, plus the
 * recognized revenue it was built from.
 *
 * MULTI-MONTH: every leg must cover the SAME window. Operating expenses and
 * refunds already span the whole period, so revenue and salary are summed
 * across the period's months too. Both used to come from the start month
 * alone, so a 3-month export subtracted 3 months of cost from 1 month of
 * income, and the yearly preset (start month = January, no attendance) printed
 * the negative of the whole year's expenses as its headline figure.
 */
export async function periodNetProfit(
  reports: ReportsService,
  companyId: number,
  args: {
    pl: any;
    salaries: any;
    outflows: any;
    monthStr: string;
    rangeStart: string;
    rangeEnd: string;
    branchIds: ReportBranchIds;
    salaryBranchId?: number;
    performedById: number;
  },
): Promise<{ np: NetProfit; recognizedRevenue: number }> {
  const { months } = aggregatableMonths(
    args.rangeStart,
    args.rangeEnd,
    args.salaries.floorMonth ?? args.monthStr,
  );

  const revenuePerMonth = await Promise.all(
    months.map((m) => {
      const [y, mm] = m.split('-').map(Number);
      return reports.getRecognizedRevenue(companyId, {
        start: new Date(Date.UTC(y, mm - 1, 1)),
        end: new Date(Date.UTC(y, mm, 1)),
        branchIds: args.branchIds,
      });
    }),
  );
  const recognizedRevenue = revenuePerMonth.reduce((a, b) => a + b, 0);

  if (months.length <= 1) {
    // Single-month export keeps the original single-call path exactly.
    return {
      recognizedRevenue,
      np: buildNetProfit(
        args.pl,
        args.salaries,
        args.outflows,
        months[0] ?? args.monthStr,
        recognizedRevenue,
      ),
    };
  }

  // `salaries` itself stays single-month — the «Oyliklar» sheet is a per-month
  // view by design. Only the profit legs are aggregated.
  const perMonth = await Promise.all(
    months.map(async (m) => ({
      month: m,
      salaries: await reports.getSalaryMonthly(
        companyId,
        m,
        args.performedById,
        args.salaryBranchId,
      ),
    })),
  );
  // No `month` argument: top-up gating is already applied per month inside
  // `sumMonthlySalaries`, so `fullDeserved` is the correct basis.
  return {
    recognizedRevenue,
    np: buildNetProfit(
      args.pl,
      sumMonthlySalaries(perMonth),
      args.outflows,
      undefined,
      recognizedRevenue,
    ),
  };
}

export interface SummarySources {
  month: string;
  prevMonth: string;
  nextMonth: string;
  periodLine: string;
  scopeLine: string;
  np: NetProfit;
  recognizedRevenue: number;
  salaries: any;
  prevSalaries: any;
  ownProfitCur: OwnMonthProfit;
  ownProfitPrev: OwnMonthProfit;
  attributionCur: any;
  /** Next month's attribution — null when that month has not started yet. */
  attributionNext: any;
  expectation: { expectedValue: number; remainingValue: number };
  payments: any;
  pl: any;
  students: StudentFlow;
}

/** Assembles everything the «Xulosa» sheet's six blocks read. */
export function buildSummaryInput(s: SummarySources): SummaryInput {
  // Where the month's lesson money came from. "Paid earlier" is a RESIDUAL:
  // once in-month cash, next-month late cash and the still-unpaid balance are
  // known, whatever remains was already sitting on student balances. It is an
  // inference, not a measurement — which is why the sheet labels it
  // "balansdagi pul" rather than claiming a payment date.
  const paidNextMonth =
    (s.attributionNext?.late ?? []).find((l: any) => l.monthKey === s.month)
      ?.amount ?? 0;
  const lessonMoney = {
    paidInMonth: s.attributionCur.currentMonth,
    paidNextMonth,
    unpaid: s.expectation.remainingValue,
    paidEarlier:
      s.recognizedRevenue - s.attributionCur.currentMonth - paidNextMonth,
    // The block foots to the month's FULL lesson value, not its recognized
    // revenue. `recognized` counts lessons held AND paid, so the first three
    // rows sum to exactly that (`heldValue`); `unpaid` is the expectation
    // engine's `remainingValue`, which also carries lessons not yet held. Only
    // `expectedValue = heldValue + remainingValue` covers all four, so only it
    // ties in an in-progress month. A CLOSED month has `remainingValue = 0`
    // and collapses back onto `recognized` — which is why the approved July
    // output is byte-identical either way.
    total: s.expectation.expectedValue,
  };

  return {
    month: s.month,
    prevMonth: s.prevMonth,
    periodLine: s.periodLine,
    scopeLine: s.scopeLine,
    cur: {
      np: s.np,
      covered: s.salaries?.totals?.covered ?? null,
      centerFunded: s.salaries?.totals?.centerFunded ?? null,
      recognized: s.recognizedRevenue,
    },
    prev: {
      np: s.ownProfitPrev.netProfit,
      covered: s.prevSalaries?.totals?.covered ?? null,
      centerFunded: s.prevSalaries?.totals?.centerFunded ?? null,
    },
    ownMoney: { cur: s.ownProfitCur.ownMoney, prev: s.ownProfitPrev.ownMoney },
    ownProfit: {
      cur: s.ownProfitCur.ownMonthProfit,
      prev: s.ownProfitPrev.ownMonthProfit,
    },
    attribution: {
      total: s.attributionCur.total,
      currentMonth: s.attributionCur.currentMonth,
      late: s.attributionCur.late,
    },
    paymentCount: (s.payments?.rows ?? []).length,
    payerCount: new Set((s.payments?.rows ?? []).map((p: any) => p.student?.id))
      .size,
    lessonMoney,
    nextMonthLabel: uzMonthLabel(s.nextMonth),
    cashOut: buildCashOut(s.pl, s.np.refunds),
    students: s.students,
  };
}

/**
 * Block 5 — cash that actually left the drawer this month. 0-amount lines are
 * dropped so the block shows only what moved; the sheet sorts what remains.
 */
export function buildCashOut(
  pl: any,
  refunds: number,
): Array<{ label: string; amount: number }> {
  return [
    {
      label: "Ustoz oyligi (naqd to'langan)",
      amount: pl?.costOfServices?.teacherSalaries ?? 0,
    },
    {
      label: 'Ustozga avans',
      amount: pl?.costOfServices?.teacherAdvances ?? 0,
    },
    ...(pl?.operatingExpenses?.byCategory ?? []).map((e: any) => ({
      label: EXPENSE_LABELS[e.category] ?? e.category,
      amount: e.amount ?? 0,
    })),
    {
      label: 'Xodimlar oyligi (naqd)',
      amount: pl?.operatingExpenses?.adminSalaries ?? 0,
    },
    { label: "O'quvchiga qaytarilgan", amount: refunds },
  ].filter((x) => x.amount > 0);
}

/**
 * «Oylar» rows. The sheet walks the month-end debt history's own month list —
 * truncated to the last 12 months up to and including the reported one — so
 * the trend and the debt columns can never disagree about which months exist.
 *
 * A single `getOwnMonthProfit` per month covers revenue, cash, salary,
 * expenses, net profit and own-month profit, and the two months the caller
 * already loaded are reused rather than re-fetched.
 */
export async function buildMonthRows(
  reports: ReportsService,
  companyId: number,
  args: {
    debtHistory: any;
    month: string;
    prevMonth: string;
    branchIds: ReportBranchIds;
    performedById: number;
    ownProfitCur: OwnMonthProfit;
    ownProfitPrev: OwnMonthProfit;
  },
): Promise<MonthRow[]> {
  const history: any[] = args.debtHistory?.months ?? [];
  const monthKeys: string[] = history
    .map((m: any) => m.monthKey as string)
    .filter((m) => m <= args.month)
    .slice(-12);

  return Promise.all(
    monthKeys.map(async (m) => {
      const own =
        m === args.month
          ? args.ownProfitCur
          : m === args.prevMonth
            ? args.ownProfitPrev
            : await reports.getOwnMonthProfit(companyId, {
                month: m,
                branchIds: args.branchIds,
                performedById: args.performedById,
              });
      return toMonthRow(
        m,
        own,
        history.find((x: any) => x.monthKey === m),
      );
    }),
  );
}

/** One «Oylar» row: the month's own-profit block plus its month-end debt. */
function toMonthRow(month: string, own: OwnMonthProfit, debt: any): MonthRow {
  return {
    month,
    recognized: own.netProfit.revenue,
    cashIn: own.cashTotal,
    teacherSalary: own.netProfit.teacherSalary,
    operatingExpenses: own.netProfit.operatingExpenses,
    netProfit: own.netProfit.netProfit,
    ownProfit: own.ownMonthProfit,
    closingDebt: debt?.closingDebt ?? null,
    recovered: debt?.recovered ?? null,
    recoveryRate: debt?.recoveryRate ?? null,
  };
}

/**
 * «Filiallar» rows — one per named branch, company-wide scope only. Each row
 * is that branch's own report: the same three calls the whole workbook makes,
 * re-issued with a single-branch scope, so `Σ(branches)` ties to the company
 * figures on «Xulosa».
 *
 * One branch's student count failing must not cost the reader the entire
 * table, so only that leg degrades — the company-wide flow is the
 * load-bearing one and is fetched outside this helper.
 */
export async function buildBranchRows(
  reports: ReportsService,
  companyId: number,
  args: {
    branchNames: Record<number, string>;
    month: string;
    performedById: number;
    safe: <T>(p: Promise<T>) => Promise<T | null>;
  },
): Promise<BranchRow[]> {
  return Promise.all(
    Object.entries(args.branchNames).map(async ([idStr, name]) => {
      const branchIds = [Number(idStr)];
      const [own, debtors, flow] = await Promise.all([
        reports.getOwnMonthProfit(companyId, {
          month: args.month,
          branchIds,
          performedById: args.performedById,
        }),
        reports.getDebtorLineItems(companyId, branchIds),
        args.safe(
          reports.getStudentFlow(companyId, { month: args.month, branchIds }),
        ),
      ]);
      return toBranchRow(name, own, debtors?.total ?? 0, flow);
    }),
  );
}

/**
 * One «Filiallar» row.
 *
 * Teacher salary lands on the branch, which is sound because one teacher
 * teaches in one branch (docs/branch-decisions.md D6), and ADMIN pay is added
 * to it — a branch's payroll is both. The sheet this replaces left salary out
 * of the per-branch profit entirely, which is the defect being fixed.
 */
function toBranchRow(
  branchName: string,
  own: OwnMonthProfit,
  debtorTotal: number,
  flow: StudentFlow | null,
): BranchRow {
  return {
    branchName,
    recognized: own.netProfit.revenue,
    cashIn: own.cashTotal,
    teacherSalary: own.netProfit.teacherSalary + own.netProfit.adminSalary,
    operatingExpenses: own.netProfit.operatingExpenses,
    refunds: own.netProfit.refunds,
    netProfit: own.netProfit.netProfit,
    debt: debtorTotal,
    inGroup: flow?.inGroup ?? 0,
  };
}
