import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { ReportsService } from './reports.service';
import { tashkentTodayStr, dmy, nowLabel } from './reports-excel.helpers';
import { uzMonthLabel } from './reports-excel.v2-helpers';
import {
  shiftMonth,
  monthEndDate,
  periodNetProfit,
  buildSummaryInput,
  buildMonthRows,
  buildBranchRows,
} from './reports-excel.workbook-input';
import { summarySheetV2 } from './reports-excel.summary-sheet';
import { studentsSheet } from './reports-excel.students-sheet';
import { monthsSheet, branchesSheet } from './reports-excel.trend-sheets';
import {
  profitLossSheet,
  balanceSheet,
  glossarySheet,
} from './reports-excel.sheets';
import {
  paymentsSheet,
  expensesSheet,
  salariesSheet,
  debtorsSheet,
  monthlyDebtSheet,
  debtorsCohortSheet,
  recoveredPaymentsSheet,
  writeOffsSheet,
  reconciliationSheet,
} from './reports-excel.detail-sheets';
import {
  leadsSheet,
  roomUtilizationSheet,
  attendanceSheet,
  teacherPerformanceSheet,
  teacherChangesSheet,
} from './reports-excel.operational-sheets';
import {
  singleBranchId,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';

export interface FinancialExcelQuery {
  /**
   * ONE resolved scope for the WHOLE workbook. The old `branchId` +
   * `branchIds` pair was read differently by different sheets, so a single
   * export could show the company's income on one sheet, 0 on the next, and a
   * third branch's name on the cover.
   */
  branchIds: ReportBranchIds;
  startDate?: string;
  endDate?: string;
  companyName?: string;
  branchLabel?: string;
  branchNames?: Record<number, string>;
  // Caller id — drives the computed-salary sheet's branch scope (getMonthly).
  performedById?: number;
  /**
   * Optional sheet groups beyond the ten defaults:
   *   'buxgalteriya' → Foyda va zarar / Balans / Tekshiruv
   *   'marketing'    → Lidlar / O'qituvchilar samaradorligi / O'qituvchi o'zgarishlari
   *   'qarzdorlar'   → Qarzdorlar
   * A CEO opening the report wants one page, not twenty-two; everything else
   * stays available but stays out of the way.
   */
  include?: string[];
  // When true AND the requested period ends before the current month, the
  // point-in-time sheets (Xonalar bandligi, plus the opt-in Balans and
  // Qarzdorlar) are omitted — they always read LIVE state (current balances,
  // active enrollments, room capacity) and can't be faithfully reconstructed
  // for a past month, so showing them on a past-month report is misleading.
  // Opt-in (the Telegram bot's month/period exports set it); the web export
  // leaves it unset and keeps the current-state sheets.
  hidePointInTimeForPastPeriod?: boolean;
}

/**
 * Builds the downloadable "Hisobot" Excel workbook. Pure orchestration: every
 * figure comes from ReportsService (no Prisma here), the inputs are assembled
 * in reports-excel.workbook-input.ts, and each sheet is rendered by a builder
 * in reports-excel.{summary,students,trend,sheets,detail,operational}-sheets.ts
 * — so the files stay small and the report stays unit-testable against a
 * mocked facade.
 *
 * A default download is TEN sheets, in this order:
 *   Xulosa / Oylar / Filiallar / Oyliklar / Xarajatlar / To'lovlar /
 *   O'quvchilar / Davomat / Xonalar bandligi / Izoh
 * «Filiallar» appears only for a company-wide scope — a single-branch export
 * has nothing to put in it.
 *
 * `query.include` bolts on three opt-in groups for the readers who need them:
 *   'buxgalteriya' → Foyda va zarar / Balans / Tekshiruv
 *   'marketing'    → Lidlar / O'qituvchilar samaradorligi / O'qituvchi o'zgarishlari
 *   'qarzdorlar'   → Qarzdorlar
 *
 * The old cover sheet is deliberately gone: its table of contents advertised a
 * «Pul oqimi» sheet `generate()` never built, and ten sheets need no index.
 *
 * Marketing/quality datasets are fetched defensively — a failed source yields
 * an empty note, never a broken workbook. The financial and student figures
 * behind «Xulosa» are NOT: a zero there reads as a fact, so a failure there
 * must surface as a failure.
 */
@Injectable()
export class ReportsExcelService {
  constructor(private reports: ReportsService) {}

  async generate(
    companyId: number,
    query: FinancialExcelQuery,
  ): Promise<Buffer> {
    const branchIds = query.branchIds ?? null;
    const scope = {
      branchIds,
      startDate: query.startDate,
      endDate: query.endDate,
    };
    const branchNames = query.branchNames ?? {};
    // Every leg reads THIS scope — including the ones that used to take their
    // own (`getReconciliation`, the trends).
    const debtorBranchIds = branchIds ?? undefined;
    const companyWide = branchIds === null;
    // Payroll and the operational sheets are still typed `branchId?: number`;
    // they re-confine themselves from `performedById`, so a multi-branch scope
    // degrading to `undefined` is safe. An EMPTY scope would NOT be — it would
    // leave them unfiltered while every other leg returned 0 — but the
    // controller refuses that caller before we get here.
    const salaryBranchId = singleBranchId(branchIds);
    const performedById = query.performedById ?? 0;
    // The report is a per-calendar-month view — use the period's start month
    // (defaults to the current month, matching the frontend default).
    const now = new Date();
    const monthStr = query.startDate
      ? query.startDate.slice(0, 7)
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevMonthStr = shiftMonth(monthStr, -1);
    const nextMonthStr = shiftMonth(monthStr, 1);

    // Point-in-time sheets read live state, so they only make sense for the
    // current month. Drop them when the caller opts in AND the period is past.
    const currentMonth = tashkentTodayStr().slice(0, 7);
    const endMonth = query.endDate?.slice(0, 7);
    const dropPointInTime =
      query.hidePointInTimeForPastPeriod === true &&
      !!endMonth &&
      endMonth < currentMonth;

    // Marketing/quality sources may fail without costing the reader the whole
    // workbook. Every financial leg below is deliberately outside this guard.
    const safe = async <T>(p: Promise<T>): Promise<T | null> => {
      try {
        return await p;
      } catch {
        return null;
      }
    };

    const [
      pl,
      bs,
      payments,
      expenses,
      salaries,
      debtors,
      recon,
      debtHistory,
      outflows,
    ] = await Promise.all([
      this.reports.getProfitLoss(companyId, scope),
      this.reports.getBalanceSheet(companyId, { branchIds }),
      this.reports.getPaymentLineItems(companyId, scope),
      this.reports.getExpenseLineItems(companyId, scope),
      // Branch scope is REQUIRED here: the revenue leg of this workbook is
      // branch-scoped, so leaving salary company-wide subtracts every branch's
      // payroll from one branch's income.
      this.reports.getSalaryMonthly(
        companyId,
        monthStr,
        performedById,
        salaryBranchId,
      ),
      this.reports.getDebtorLineItems(companyId, debtorBranchIds),
      this.reports.getReconciliation(companyId, scope),
      // Month-end debt + recovery — ledger-reconstructed, period-independent.
      // Also supplies the month list «Oylar» walks.
      this.reports.getMonthlyDebtRecovery(companyId, branchIds),
      // Outflows the legacy netProfit misses (refunds / write-offs / gateway
      // fees) — feed the "Sof foyda" figure.
      this.reports.getPeriodOutflows(companyId, scope),
    ]);

    // ─── Operational (non-financial) datasets ────────────────────────────────
    // Some of these require a date range (teacher-changes) or read better with
    // one — default to the period's month-start → today when the caller left
    // them open.
    const opStart = query.startDate ?? `${monthStr}-01`;
    const opEnd = query.endDate ?? tashkentTodayStr();
    const opQ = {
      branchId: salaryBranchId,
      startDate: opStart,
      endDate: opEnd,
    };
    const [leads, rooms, attendance, teacherPerf, teacherChanges] =
      await Promise.all([
        safe(
          this.reports.getLeadAnalytics({ startDate: opStart, endDate: opEnd }),
        ),
        safe(this.reports.getRoomUtilization(companyId, opQ)),
        safe(this.reports.getAttendanceAnalytics(companyId, opQ)),
        safe(
          this.reports.getTeacherPerformance(companyId, {
            ...opQ,
            page: 1,
            pageSize: 100,
          }),
        ),
        safe(this.reports.getTeacherChangesList(companyId, opQ)),
      ]);

    // The single authoritative "Sof foyda", assembled once and reused by the
    // «Xulosa» headline and the Tekshiruv footing.
    const rangeStart = query.startDate ?? `${monthStr}-01`;
    const rangeEnd = query.endDate ?? `${monthStr}-31`;
    const { np, recognizedRevenue } = await periodNetProfit(
      this.reports,
      companyId,
      {
        pl,
        salaries,
        outflows,
        monthStr,
        rangeStart,
        rangeEnd,
        branchIds,
        salaryBranchId,
        performedById,
      },
    );

    // ─── «Xulosa» / «Oylar» / «Filiallar» datasets ───────────────────────────
    const [
      ownProfitCur,
      ownProfitPrev,
      studentFlow,
      attributionCur,
      attributionNext,
      expectation,
      prevSalaries,
    ] = await Promise.all([
      this.reports.getOwnMonthProfit(companyId, {
        month: monthStr,
        branchIds,
        performedById,
      }),
      this.reports.getOwnMonthProfit(companyId, {
        month: prevMonthStr,
        branchIds,
        performedById,
      }),
      this.reports.getStudentFlow(companyId, { month: monthStr, branchIds }),
      this.reports.getIncomeMonthAttribution(companyId, {
        branchIds,
        startDate: `${monthStr}-01`,
        endDate: monthEndDate(monthStr),
      }),
      // The month AFTER the report is the one window that may legitimately not
      // exist yet, so this leg alone degrades to null.
      safe(
        this.reports.getIncomeMonthAttribution(companyId, {
          branchIds,
          startDate: `${nextMonthStr}-01`,
          endDate: monthEndDate(nextMonthStr),
        }),
      ),
      this.reports.getMonthlyExpectation(companyId, {
        month: monthStr,
        branchIds,
      }),
      this.reports.getSalaryMonthly(
        companyId,
        prevMonthStr,
        performedById,
        salaryBranchId,
      ),
    ]);

    const period = this.periodLabel(pl?.period?.start, pl?.period?.end);
    const periodLine = `Davr: ${dmy(rangeStart)} — ${dmy(rangeEnd)} (${uzMonthLabel(monthStr)})`;
    const scopeLine = `${query.companyName ?? 'DaF Sprachzentrum'} · ${query.branchLabel ?? 'Barcha filiallar'} · yaratildi ${nowLabel()} · summalar so'mda`;

    const summaryInput = buildSummaryInput({
      month: monthStr,
      prevMonth: prevMonthStr,
      nextMonth: nextMonthStr,
      periodLine,
      scopeLine,
      np,
      recognizedRevenue,
      salaries,
      prevSalaries,
      ownProfitCur,
      ownProfitPrev,
      attributionCur,
      attributionNext,
      expectation,
      payments,
      pl,
      students: studentFlow,
    });

    const monthRows = await buildMonthRows(this.reports, companyId, {
      debtHistory,
      month: monthStr,
      prevMonth: prevMonthStr,
      branchIds,
      performedById,
      ownProfitCur,
      ownProfitPrev,
    });

    const branchRows = companyWide
      ? await buildBranchRows(this.reports, companyId, {
          branchNames,
          month: monthStr,
          performedById,
          safe,
        })
      : [];

    const wb = new Workbook();
    wb.creator = 'DaF Sprachzentrum ERP';
    wb.created = new Date(0);

    const include = new Set(query.include ?? []);
    const opPeriod = `${dmy(opStart)} — ${dmy(opEnd)}`;

    summarySheetV2(wb, summaryInput);
    monthsSheet(wb, monthRows, scopeLine);
    if (companyWide) branchesSheet(wb, branchRows, periodLine, scopeLine);
    // `salaries` covers ONE month (a per-month view by design, even inside a
    // multi-month export), and `getSalaryMonthly` CLAMPS a too-early request up
    // to the reporting floor — so the delivered month is not always `monthStr`.
    // Name the month the data came from, or the header lies about its own rows.
    salariesSheet(wb, salaries, period, uzMonthLabel(salaries.month));
    expensesSheet(wb, expenses, branchNames, period);
    paymentsSheet(wb, payments, branchNames, period);
    studentsSheet(wb, studentFlow, periodLine, scopeLine);
    attendanceSheet(wb, attendance, opPeriod);
    if (!dropPointInTime) roomUtilizationSheet(wb, rooms, opPeriod);

    if (include.has('buxgalteriya')) {
      profitLossSheet(wb, pl, period);
      if (!dropPointInTime) balanceSheet(wb, bs);
      reconciliationSheet(
        wb,
        recon,
        pl,
        payments,
        expenses,
        salaries,
        debtors,
        bs,
        period,
        !dropPointInTime,
        np,
      );
    }
    if (include.has('marketing')) {
      leadsSheet(wb, leads, opPeriod);
      teacherPerformanceSheet(wb, teacherPerf, opPeriod);
      teacherChangesSheet(wb, teacherChanges, opPeriod);
    }
    if (include.has('qarzdorlar') && !dropPointInTime) {
      debtorsSheet(wb, debtors, branchNames);
    }
    glossarySheet(wb);

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /**
   * Dedicated "Oylik qarzdorlik" workbook for the /payments/debt-history page —
   * separate from the main report. Four sheets: Umumiy (the month summary,
   * reusing `monthlyDebtSheet`) + per-student detail for Qarzdorlar /
   * Undirildi / Kechirilgan, each row tagged with its month label. All figures
   * flow through ReportsService (no Prisma here).
   */
  async generateDebtHistory(
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<Buffer> {
    // Both legs take the SAME scope. Passing it to one and not the other is how
    // a workbook came to print one branch's total on the summary sheet and
    // another branch's rows underneath it.
    const debtHistory = await this.reports.getMonthlyDebtRecovery(
      companyId,
      scope,
    );
    const details = await Promise.all(
      debtHistory.months.map((m) =>
        this.reports.getMonthDebtDetail(companyId, m.monthKey, scope),
      ),
    );
    const debtorRows = details.flatMap((d) =>
      d.debtors.map((x) => ({ month: d.label, ...x })),
    );
    const payRows = details.flatMap((d) =>
      d.recoveredPayments.map((x) => ({ month: d.label, ...x })),
    );
    const woRows = details.flatMap((d) =>
      d.writeOffs.map((x) => ({ month: d.label, ...x })),
    );

    const wb = new Workbook();
    wb.creator = 'DaF Sprachzentrum ERP';
    wb.created = new Date(0);
    monthlyDebtSheet(wb, debtHistory);
    debtorsCohortSheet(wb, debtorRows);
    recoveredPaymentsSheet(wb, payRows);
    writeOffsSheet(wb, woRows);

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /**
   * Honest period label. When the requested end is still in the future
   * (report pulled mid-month), the label clamps to today and says so — the
   * data queries keep the requested end (no future rows exist anyway).
   */
  private periodLabel(startStr?: string, endStr?: string): string {
    if (!startStr || !endStr) return '';
    const today = tashkentTodayStr();
    if (endStr > today) {
      return `${dmy(startStr)} — ${dmy(today)} (oy boshidan bugungi kungacha, davr hali tugamagan)`;
    }
    return `${dmy(startStr)} — ${dmy(endStr)}`;
  }
}
