import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { ReportsService } from './reports.service';
import {
  aggregatableMonths,
  sumMonthlySalaries,
} from './reports-excel.month-range';
import {
  tashkentTodayStr,
  dmy,
  nowLabel,
  buildNetProfit,
} from './reports-excel.helpers';
import {
  coverSheet,
  summarySheet,
  netProfitSheet,
  profitLossSheet,
  balanceSheet,
  methodsSheet,
  glossarySheet,
} from './reports-excel.sheets';
import {
  paymentsSheet,
  expensesSheet,
  salariesSheet,
  debtorsSheet,
  trendSheet,
  monthlyDebtSheet,
  debtorsCohortSheet,
  recoveredPaymentsSheet,
  writeOffsSheet,
  perBranchSheet,
  reconciliationSheet,
} from './reports-excel.detail-sheets';
import {
  kpiSheet,
  leadsSheet,
  studentFlowSheet,
  roomUtilizationSheet,
  groupFillSheet,
  attendanceSheet,
  teacherPerformanceSheet,
  teacherChangesSheet,
} from './reports-excel.operational-sheets';
import {
  comparisonSheet,
  yearlyTrendSheet,
  periodTag,
  ComparisonInput,
} from './reports-excel.comparison-sheets';
import {
  singleBranchId,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';

export interface FinancialExcelQuery {
  /**
   * ONE resolved scope for the WHOLE workbook. The old `branchId` +
   * `branchIds` pair was read differently by different sheets, so a single
   * export could show the company's income on «Asosiy xulosa», 0 on «Foyda va
   * zarar», and a third branch's name on the cover.
   */
  branchIds: ReportBranchIds;
  startDate?: string;
  endDate?: string;
  companyName?: string;
  branchLabel?: string;
  branchNames?: Record<number, string>;
  // Caller id — drives the computed-salary sheet's branch scope (getMonthly).
  performedById?: number;
  // Comparison controls for the "Taqqoslash" + "Yillar kesimida" sheets.
  // Any of: 'prev' (previous equal-length period), 'yoy' (same period last
  // year), 'custom' (compareStartDate/End), 'yearly' (the multi-year sheet).
  compareModes?: string[];
  compareStartDate?: string;
  compareEndDate?: string;
  // When true AND the requested period ends before the current month, the
  // point-in-time sheets (Balans, Qarzdorlar, KPI, Xonalar bandligi, Guruhlar
  // to'ldirilishi) are omitted — they always read LIVE state (current balances,
  // active enrollments, room capacity) and can't be faithfully reconstructed
  // for a past month, so showing them on a past-month report is misleading.
  // Opt-in (the Telegram bot's month/period exports set it); the web export
  // leaves it unset and keeps the current-state sheets.
  hidePointInTimeForPastPeriod?: boolean;
}

/**
 * Builds the downloadable "Moliyaviy hisobot" Excel workbook — the finance
 * section's single deliverable, now widened into a full business report. Pure
 * orchestration: every figure comes from ReportsService (no Prisma here), and
 * each sheet is rendered by a builder in reports-excel.{sheets,detail-sheets,
 * operational-sheets}.ts, so the files stay small and the report stays
 * unit-testable with a mocked facade.
 *
 * Financial sheets: Muqova / Asosiy xulosa / Foyda va zarar / Balans /
 * To'lovlar / Xarajatlar / Oyliklar / Qarzdorlar / Oylik dinamika /
 * [Filial kesimida] / To'lov usullari. Operational sheets (marketing → students
 * → capacity → quality): KPI paneli / Lidlar / O'quvchilar oqimi / Xonalar
 * bandligi / Guruhlar to'ldirilishi / Davomat / O'qituvchilar samaradorligi /
 * O'qituvchi o'zgarishlari. Then Tekshiruv (ties every financial total) / Izoh.
 * Operational datasets are fetched defensively — a failed source yields an empty
 * note, never a broken workbook.
 */
@Injectable()
export class ReportsExcelService {
  constructor(private reports: ReportsService) {}

  async generate(companyId: number, query: FinancialExcelQuery): Promise<Buffer> {
    const branchIds = query.branchIds ?? null;
    const scope = {
      branchIds,
      startDate: query.startDate,
      endDate: query.endDate,
    };
    const periodScope = { startDate: query.startDate, endDate: query.endDate };
    const branchNames = query.branchNames ?? {};
    // Every sheet now reads THIS scope — including the ones that used to take
    // their own (`getFinancialOverview`, the trends, `getReconciliation`).
    const debtorBranchIds = branchIds ?? undefined;
    const companyWide = branchIds === null;
    // Payroll and the operational sheets are still typed `branchId?: number`;
    // they re-confine themselves from `performedById`, so a multi-branch scope
    // degrading to `undefined` is safe. An EMPTY scope would NOT be — it would
    // leave them unfiltered while every other leg returned 0 — but the
    // controller refuses that caller before we get here.
    const salaryBranchId = singleBranchId(branchIds);
    // Computed-salary sheet is per calendar month — use the period's start month
    // (defaults to the current month, matching the frontend default).
    const now = new Date();
    const monthStr = query.startDate
      ? query.startDate.slice(0, 7)
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Point-in-time sheets read live state, so they only make sense for the
    // current month. Drop them when the caller opts in AND the period is past.
    const currentMonth = tashkentTodayStr().slice(0, 7);
    const endMonth = query.endDate?.slice(0, 7);
    const dropPointInTime =
      query.hidePointInTimeForPastPeriod === true &&
      !!endMonth &&
      endMonth < currentMonth;

    const [
      overview,
      pl,
      bs,
      payments,
      expenses,
      salaries,
      debtors,
      trend,
      perBranch,
      recon,
      prior,
      debtHistory,
      outflows,
    ] = await Promise.all([
      this.reports.getFinancialOverview(companyId, scope),
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
        query.performedById ?? 0,
        salaryBranchId,
      ),
      this.reports.getDebtorLineItems(companyId, debtorBranchIds),
      this.reports.getFinancialTrend(companyId, branchIds),
      companyWide
        ? this.reports.getPerBranchSummary(companyId, periodScope)
        : Promise.resolve([]),
      this.reports.getReconciliation(companyId, { ...periodScope, branchIds }),
      this.reports.getPriorPeriodSummary(companyId, scope),
      // Month-end debt + recovery — ledger-reconstructed, period-independent.
      // Same resolved scope as every other leg of this workbook — passing it
      // to one leg and not another is how a cover page came to name one branch
      // while the sheet under it totalled another.
      this.reports.getMonthlyDebtRecovery(companyId, branchIds),
      // Outflows the legacy netProfit misses (refunds / write-offs / gateway
      // fees) — feed the "Sof foyda" block.
      this.reports.getPeriodOutflows(companyId, scope),
    ]);

    // ─── Operational (non-financial) datasets ────────────────────────────────
    // Each is fetched defensively: if a source throws, its sheet renders an
    // "ma'lumot yo'q" note instead of failing the whole workbook. Some methods
    // require a date range (teacher-changes) or read better with one — default
    // to the period's month-start → today when the caller left them open.
    const opStart = query.startDate ?? `${monthStr}-01`;
    const opEnd = query.endDate ?? tashkentTodayStr();
    const opQ = { branchId: salaryBranchId, startDate: opStart, endDate: opEnd };
    const branchParams = {
      branchId: salaryBranchId,
      startDate: opStart,
      endDate: opEnd,
    };
    const safe = async <T>(p: Promise<T>): Promise<T | null> => {
      try {
        return await p;
      } catch {
        return null;
      }
    };
    const [
      kpis,
      leads,
      departedSummary,
      departedDynamics,
      departedReasons,
      rooms,
      groupAnalytics,
      attendance,
      teacherPerf,
      teacherChanges,
    ] = await Promise.all([
      safe(this.reports.getKpis(companyId, opQ)),
      safe(this.reports.getLeadAnalytics({ startDate: opStart, endDate: opEnd })),
      safe(this.reports.getDepartedStudentsSummary(companyId, branchParams)),
      safe(
        this.reports.getDepartedStudentsDynamics(companyId, {
          branchId: salaryBranchId,
        }),
      ),
      safe(this.reports.getDepartedStudentsReasons(companyId, branchParams)),
      safe(this.reports.getRoomUtilization(companyId, opQ)),
      safe(this.reports.getGroupAnalytics(companyId, opQ)),
      safe(this.reports.getAttendanceAnalytics(companyId, opQ)),
      safe(this.reports.getTeacherPerformance(companyId, { ...opQ, page: 1, pageSize: 100 })),
      safe(this.reports.getTeacherChangesList(companyId, branchParams)),
    ]);

    // ─── Comparison windows (Taqqoslash + Yillar kesimida) ───────────────────
    const compareModes = query.compareModes ?? [];
    const winModes = compareModes.filter(
      (m) => m === 'prev' || m === 'yoy' || m === 'custom',
    );
    const includeYearly = compareModes.includes('yearly');

    // Concrete current window (mirror resolvePeriod's current-month default).
    const nowD = new Date();
    const mp = String(nowD.getMonth() + 1).padStart(2, '0');
    const lastDayNow = new Date(
      nowD.getFullYear(),
      nowD.getMonth() + 1,
      0,
    ).getDate();
    const curStart = query.startDate ?? `${nowD.getFullYear()}-${mp}-01`;
    const curEnd =
      query.endDate ??
      `${nowD.getFullYear()}-${mp}-${String(lastDayNow).padStart(2, '0')}`;

    // prev = equal-length window immediately before curStart (= getPriorPeriodSummary).
    const cs = new Date(curStart);
    const ce = new Date(curEnd + 'T23:59:59.999Z');
    const durationMs = ce.getTime() - cs.getTime();
    const prevEnd = new Date(cs.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    // yoy = current window shifted back exactly one year (same month/day).
    const shiftYear = (ds: string, by: number) => {
      const [y, m, d] = ds.split('-');
      return `${Number(y) + by}-${m}-${d}`;
    };

    const currentTag = periodTag(curStart, curEnd);
    const priorTag = periodTag(iso(prevStart), iso(prevEnd));

    const windows: { label: string; start: string; end: string }[] = [];
    if (winModes.includes('prev')) {
      windows.push({ label: 'Oldingi davr', start: iso(prevStart), end: iso(prevEnd) });
    }
    if (winModes.includes('yoy')) {
      windows.push({ label: "O'tgan yil", start: shiftYear(curStart, -1), end: shiftYear(curEnd, -1) });
    }
    if (winModes.includes('custom') && query.compareStartDate && query.compareEndDate) {
      windows.push({ label: 'Maxsus davr', start: query.compareStartDate, end: query.compareEndDate });
    }

    // Each comparison window pulls the same three period-scoped datasets the
    // "Taqqoslash" sheet compares across areas (Moliya/O'quvchilar/Davomat/Lidlar).
    const [comparisonData, yearly] = await Promise.all([
      Promise.all(
        windows.map(async (w): Promise<ComparisonInput> => {
          const [ov, att, ld] = await Promise.all([
            safe(
              this.reports.getFinancialOverview(companyId, {
                branchIds,
                startDate: w.start,
                endDate: w.end,
              }),
            ),
            safe(
              this.reports.getAttendanceAnalytics(companyId, {
                branchId: salaryBranchId,
                startDate: w.start,
                endDate: w.end,
              }),
            ),
            safe(this.reports.getLeadAnalytics({ startDate: w.start, endDate: w.end })),
          ]);
          return {
            label: w.label,
            tag: periodTag(w.start, w.end),
            sublabel: `${dmy(w.start)} — ${dmy(w.end)}`,
            overview: ov,
            attendance: att,
            leads: ld,
          };
        }),
      ),
      includeYearly
        ? safe(this.reports.getYearlyTrend(companyId, branchIds))
        : Promise.resolve(null),
    ]);

    const period = this.periodLabel(pl?.period?.start, pl?.period?.end);
    const wb = new Workbook();
    wb.creator = 'DaF Sprachzentrum ERP';
    wb.created = new Date(0);

    coverSheet(
      wb,
      query.companyName ?? 'DaF Sprachzentrum',
      query.branchLabel ?? 'Barcha filiallar',
      period,
      companyWide,
      nowLabel(),
    );
    // Single authoritative "Sof foyda" — assembled once, reused by the summary
    // headline + the dedicated sheet + the reconciliation tie. Revenue is the
    // "dars tushumi" (recognized — lessons HELD this month), so it pairs with the
    // covered teacher salary and isolates the month from late/pre-payments.
    //
    // MULTI-MONTH: every leg must cover the SAME window. Operating expenses and
    // refunds already span the whole period, so revenue and salary are summed
    // across the period's months too. Previously both came from `monthStr`
    // alone, so a 3-month export subtracted 3 months of cost from 1 month of
    // income, and the yearly preset (monthStr = 2026-01, no attendance) printed
    // the negative of the whole year's expenses as its headline figure.
    const rangeStart = query.startDate ?? `${monthStr}-01`;
    const rangeEnd = query.endDate ?? `${monthStr}-31`;
    const { months: profitMonths } = aggregatableMonths(
      rangeStart,
      rangeEnd,
      salaries.floorMonth ?? monthStr,
    );

    const revenuePerMonth = await Promise.all(
      profitMonths.map((m) => {
        const [y, mm] = m.split('-').map(Number);
        return this.reports.getRecognizedRevenue(companyId, {
          start: new Date(Date.UTC(y, mm - 1, 1)),
          end: new Date(Date.UTC(y, mm, 1)),
          branchIds,
        });
      }),
    );
    const recognizedRevenue = revenuePerMonth.reduce((a, b) => a + b, 0);

    let np;
    if (profitMonths.length <= 1) {
      // Single-month export keeps the original single-call path exactly.
      np = buildNetProfit(
        pl,
        salaries,
        outflows,
        profitMonths[0] ?? monthStr,
        recognizedRevenue,
      );
    } else {
      // `salaries` itself stays single-month — the "Oyliklar" sheet is a
      // per-month view by design. Only the profit legs are aggregated.
      const perMonth = await Promise.all(
        profitMonths.map(async (m) => ({
          month: m,
          salaries: await this.reports.getSalaryMonthly(
            companyId,
            m,
            query.performedById ?? 0,
            salaryBranchId,
          ),
        })),
      );
      const aggregated = sumMonthlySalaries(perMonth);
      // No `month` argument: top-up gating is already applied per month inside
      // `sumMonthlySalaries`, so `fullDeserved` is the correct basis.
      np = buildNetProfit(pl, aggregated, outflows, undefined, recognizedRevenue);
    }
    summarySheet(wb, overview, prior, period, currentTag, priorTag, np);
    netProfitSheet(wb, np, period);
    profitLossSheet(wb, pl, period);
    if (!dropPointInTime) balanceSheet(wb, bs);
    paymentsSheet(wb, payments, branchNames, period);
    expensesSheet(wb, expenses, branchNames, period);
    salariesSheet(wb, salaries, period);
    if (!dropPointInTime) debtorsSheet(wb, debtors, branchNames);
    trendSheet(wb, trend);
    // Past-safe: reconstructed from the ledger, so never gated by dropPointInTime.
    monthlyDebtSheet(wb, debtHistory);
    if (companyWide) perBranchSheet(wb, perBranch, period);
    methodsSheet(wb, overview, pl, period);
    // ─── Operational block (marketing → students → capacity → quality) ──────
    const opPeriod = `${dmy(opStart)} — ${dmy(opEnd)}`;
    if (!dropPointInTime) kpiSheet(wb, kpis, opPeriod);
    leadsSheet(wb, leads, opPeriod);
    studentFlowSheet(wb, departedSummary, departedDynamics, departedReasons, opPeriod);
    if (!dropPointInTime) roomUtilizationSheet(wb, rooms, opPeriod);
    if (!dropPointInTime) groupFillSheet(wb, groupAnalytics, opPeriod);
    attendanceSheet(wb, attendance, opPeriod);
    teacherPerformanceSheet(wb, teacherPerf, opPeriod);
    teacherChangesSheet(wb, teacherChanges, opPeriod);
    // ─── Comparison block (period-over-period + multi-year) ─────────────────
    if (comparisonData.length > 0)
      comparisonSheet(
        wb,
        { overview, attendance, leads },
        currentTag,
        comparisonData,
        period,
      );
    if (yearly) yearlyTrendSheet(wb, yearly);
    reconciliationSheet(wb, recon, pl, payments, expenses, salaries, debtors, bs, period, !dropPointInTime, np);
    glossarySheet(wb);

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /**
   * Dedicated "Oylik qarzdorlik" workbook for the /payments/debt-history page —
   * separate from the giant financial report. Four sheets: Umumiy (the month
   * summary, reusing `monthlyDebtSheet`) + per-student detail for Qarzdorlar /
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
