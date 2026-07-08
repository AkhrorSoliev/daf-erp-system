import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { ReportsService } from './reports.service';
import { tashkentTodayStr, dmy, nowLabel } from './reports-excel.helpers';
import {
  coverSheet,
  summarySheet,
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

export interface FinancialExcelQuery {
  branchId?: number;
  branchIds?: number[];
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
    const scope = {
      branchId: query.branchId,
      branchIds: query.branchIds,
      startDate: query.startDate,
      endDate: query.endDate,
    };
    const periodScope = { startDate: query.startDate, endDate: query.endDate };
    const branchNames = query.branchNames ?? {};
    // Debtor + balance-sheet scope must match so the Qarzdorlar total ties.
    const debtorBranchIds =
      query.branchIds && query.branchIds.length > 0
        ? query.branchIds
        : query.branchId
          ? [query.branchId]
          : undefined;
    const companyWide =
      !query.branchId && !(query.branchIds && query.branchIds.length > 0);
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
    ] = await Promise.all([
      this.reports.getFinancialOverview(companyId, {
        branchId: query.branchId,
        startDate: query.startDate,
        endDate: query.endDate,
      }),
      this.reports.getProfitLoss(companyId, scope),
      this.reports.getBalanceSheet(companyId, {
        branchId: query.branchId,
        branchIds: query.branchIds,
      }),
      this.reports.getPaymentLineItems(companyId, scope),
      this.reports.getExpenseLineItems(companyId, scope),
      this.reports.getSalaryMonthly(companyId, monthStr, query.performedById ?? 0),
      this.reports.getDebtorLineItems(companyId, debtorBranchIds),
      this.reports.getFinancialTrend(companyId, query.branchId),
      companyWide
        ? this.reports.getPerBranchSummary(companyId, periodScope)
        : Promise.resolve([]),
      this.reports.getReconciliation(companyId, periodScope),
      this.reports.getPriorPeriodSummary(companyId, scope),
    ]);

    // ─── Operational (non-financial) datasets ────────────────────────────────
    // Each is fetched defensively: if a source throws, its sheet renders an
    // "ma'lumot yo'q" note instead of failing the whole workbook. Some methods
    // require a date range (teacher-changes) or read better with one — default
    // to the period's month-start → today when the caller left them open.
    const opStart = query.startDate ?? `${monthStr}-01`;
    const opEnd = query.endDate ?? tashkentTodayStr();
    const opQ = { branchId: query.branchId, startDate: opStart, endDate: opEnd };
    const branchParams = { branchId: query.branchId, startDate: opStart, endDate: opEnd };
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
      safe(this.reports.getDepartedStudentsDynamics(companyId, { branchId: query.branchId })),
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
                branchId: query.branchId,
                startDate: w.start,
                endDate: w.end,
              }),
            ),
            safe(
              this.reports.getAttendanceAnalytics(companyId, {
                branchId: query.branchId,
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
        ? safe(this.reports.getYearlyTrend(companyId, query.branchId))
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
    summarySheet(wb, overview, prior, period, currentTag, priorTag, salaries?.totals?.netToPay ?? 0);
    profitLossSheet(wb, pl, period);
    if (!dropPointInTime) balanceSheet(wb, bs);
    paymentsSheet(wb, payments, branchNames, period);
    expensesSheet(wb, expenses, branchNames, period);
    salariesSheet(wb, salaries, period);
    if (!dropPointInTime) debtorsSheet(wb, debtors, branchNames);
    trendSheet(wb, trend);
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
    reconciliationSheet(wb, recon, pl, payments, expenses, salaries, debtors, bs, period, !dropPointInTime);
    glossarySheet(wb);

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
