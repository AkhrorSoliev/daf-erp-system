import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { ReportsService } from './reports.service';
import { tashkentTodayStr, dmy, nowLabel } from './reports-excel.helpers';
import {
  coverSheet,
  summarySheet,
  profitLossSheet,
  cashFlowSheet,
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
}

/**
 * Builds the downloadable "Moliyaviy hisobot" Excel workbook — the finance
 * section's single deliverable. Pure orchestration: every figure comes from
 * ReportsService (no Prisma here), and each of the 14 sheets is rendered by a
 * builder in reports-excel.sheets.ts, so both files stay small and the report
 * stays unit-testable with a mocked facade.
 *
 * Sheets: Muqova / Asosiy xulosa / Foyda va zarar / Pul oqimi / Balans /
 * To'lovlar / Xarajatlar / Oyliklar / Qarzdorlar / Oylik dinamika /
 * [Filial kesimida] / To'lov usullari / Tekshiruv / Izoh. Plain-language on top
 * of the formal statements, fully drillable (line-item sheets), and
 * self-verifying (the Tekshiruv sheet ties every total).
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

    const [
      overview,
      pl,
      cf,
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
      this.reports.getCashFlow(companyId, scope),
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
    summarySheet(wb, overview, prior, cf, period, salaries?.totals?.netToPay ?? 0);
    profitLossSheet(wb, pl, period);
    cashFlowSheet(wb, cf, period);
    balanceSheet(wb, bs);
    paymentsSheet(wb, payments, branchNames, period);
    expensesSheet(wb, expenses, branchNames, period);
    salariesSheet(wb, salaries, period);
    debtorsSheet(wb, debtors, branchNames);
    trendSheet(wb, trend);
    if (companyWide) perBranchSheet(wb, perBranch, period);
    methodsSheet(wb, overview, pl, period);
    reconciliationSheet(wb, recon, cf, pl, payments, expenses, salaries, debtors, bs, period);
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
