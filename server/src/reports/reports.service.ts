import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { cachedNetProfit } from './net-profit-cache';
import { StudentStatus } from '@prisma/client';
import { ReportsQueryDto } from './dto/reports-query.dto';
import { ReportsOverviewService } from './reports-overview.service';
import { ReportsAttendanceAnalyticsService } from './reports-attendance-analytics.service';
import { ReportsFinancialService } from './reports-financial.service';
import {
  ReportsDebtHistoryService,
  type DebtStatusFilter,
} from './reports-debt-history.service';
import { ReportsPaymentsService } from './reports-payments.service';
import { ReportsTeacherPaymentsService } from './reports-teacher-payments.service';
import { ReportsStudentPaymentsService } from './reports-student-payments.service';
import { ReportsDepartedStudentsService } from './reports-departed-students.service';
import { ReportsDepartedListsService } from './reports-departed-lists.service';
import { ReportsDepartedReasonsService } from './reports-departed-reasons.service';
import { ReportsTeacherChangesService } from './reports-teacher-changes.service';
import { ReportsCenterActivityService } from './reports-center-activity.service';
import { ReportsExpectationService } from './reports-expectation.service';
import { ReportsExpectationHistoryService } from './reports-expectation-history.service';
import { ReportsStudentFlowService } from './reports-student-flow.service';
import {
  isEmptyScope,
  singleBranchId,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import {
  ReportsProfitLossService,
  ProfitLossQuery,
} from './reports-profit-loss.service';
import {
  ReportsCashFlowService,
  CashFlowQuery,
} from './reports-cash-flow.service';
import {
  ReportsBalanceSheetService,
  BalanceSheetQuery,
} from './reports-balance-sheet.service';
import { CenterActivityQueryDto } from './dto/center-activity-query.dto';
import {
  AttendanceAnalyticsQueryDto,
  AttendanceByCourseQueryDto,
  AttendanceByGroupQueryDto,
  AttendanceTeacherPerfQueryDto,
} from './dto/attendance-reports-query.dto';
import { buildNetProfit, NetProfit } from './reports-excel.helpers';
import { computeOwnMonthProfit } from './own-month-profit';
import { ExpensesService } from '../expenses/expenses.service';
import { SalaryPaymentService } from '../salary/salary-payment.service';
import { SalaryService } from '../salary/salary.service';
import { PaymentsDebtorsService } from '../payments/payments-debtors.service';

// Shared shape for the Excel report's period + branch scope.
export interface ReportScopeQuery {
  /**
   * ONE resolved branch scope (`resolveReportBranchIds`), never a raw
   * `branchId` + `branchIds` pair. The pair is what let a single workbook hold
   * three different scopes: the sheets built from `branchIds` showed 0 while
   * the ones built from `branchId` showed the whole company, under a cover
   * page naming a third thing.
   */
  branchIds: ReportBranchIds;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private overview: ReportsOverviewService,
    private attendanceAnalytics: ReportsAttendanceAnalyticsService,
    private financial: ReportsFinancialService,
    private debtHistory: ReportsDebtHistoryService,
    private payments: ReportsPaymentsService,
    private teacherPayments: ReportsTeacherPaymentsService,
    private studentPayments: ReportsStudentPaymentsService,
    private departedStudents: ReportsDepartedStudentsService,
    private departedLists: ReportsDepartedListsService,
    private departedReasons: ReportsDepartedReasonsService,
    private teacherChanges: ReportsTeacherChangesService,
    private centerActivity: ReportsCenterActivityService,
    private profitLoss: ReportsProfitLossService,
    private cashFlow: ReportsCashFlowService,
    private balanceSheet: ReportsBalanceSheetService,
    private expenses: ExpensesService,
    private salaryPayments: SalaryPaymentService,
    private salary: SalaryService,
    private debtors: PaymentsDebtorsService,
    private redis: RedisService,
    private expectation: ReportsExpectationService,
    private expectationHistory: ReportsExpectationHistoryService,
    private studentFlow: ReportsStudentFlowService,
  ) {}

  // Excel financial report — line-item + reconciliation data sources. Kept on
  // the facade so ReportsExcelService stays Prisma-free and depends only on
  // ReportsService.
  getPaymentLineItems(companyId: number, query: ReportScopeQuery) {
    return this.payments.getPaymentLineItems(companyId, query);
  }
  getExpenseLineItems(companyId: number, query: ReportScopeQuery) {
    return this.expenses.exportAllForReport(companyId, query);
  }
  getSalaryLineItems(
    companyId: number,
    query: { startDate?: string; endDate?: string },
  ) {
    return this.salaryPayments.getSalaryLineItemsForPeriod(companyId, query);
  }
  // Computed monthly teacher salary (the /payments/salary "Oyliklar" view) —
  // meaningful for the month even before payroll is disbursed. `performedById`
  // drives branch scope (CEO/Admin → all teachers; BD → own branch).
  getSalaryMonthly(
    companyId: number,
    month: string,
    performedById: number,
    branchId?: number,
  ) {
    return this.salary.getMonthly({ month, branchId }, companyId, performedById);
  }
  // "Dars tushumi" — recognized revenue for lessons HELD in the window (by
  // attendance date), the isolated basis the Foyda card + Excel "Sof foyda" use.
  getRecognizedRevenue(
    companyId: number,
    opts: { start: Date; end: Date; branchIds: ReportBranchIds },
  ) {
    return this.financial.getRecognizedRevenue(companyId, opts);
  }

  /**
   * Canonical monthly "Sof foyda" — the ONE net-profit figure the Foyda card and
   * the Excel "Sof foyda" sheet share, so they can never disagree:
   *
   *   dars tushumi (recognized — lessons held this month)
   *   − ustoz oyligi (covered + center top-up gap, gated from TOPUP_EFFECTIVE_MONTH)
   *   − admin oyligi − operatsion xarajatlar (avanssiz) − qaytarishlar
   *   = SOF FOYDA
   *
   * Each month is isolated to its own lessons; late payments recognize in the
   * lesson's month, so the current month is never painted by old-debt cash.
   * `performedById` drives branch scope (CEO/BD). Month = "YYYY-MM".
   */
  async getMonthlyNetProfit(
    companyId: number,
    {
      month,
      branchIds,
      performedById,
    }: {
      month: string;
      branchIds: ReportBranchIds;
      performedById: number;
    },
  ): Promise<NetProfit> {
    // A confined caller with no branch (or one asking for a branch outside
    // their scope) gets zeros. Without this the revenue legs would all filter
    // to nothing while `getSalaryMonthly` — which re-derives its own scope from
    // `performedById` and so ignores an empty list — still returned that
    // caller's payroll, printing a large fictitious LOSS.
    if (isEmptyScope(branchIds)) {
      return buildNetProfit(null, null, null, month, 0);
    }
    const [y, m] = month.split('-').map(Number);
    const startDate = `${month}-01`;
    const endDate = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    const scope = { branchIds, startDate, endDate };
    const [recognizedRevenue, sm, pl, outflows] = await Promise.all([
      this.getRecognizedRevenue(companyId, {
        start: new Date(Date.UTC(y, m - 1, 1)),
        end: new Date(Date.UTC(y, m, 1)),
        branchIds,
      }),
      // Branch-scoped: subtracting company-wide payroll from ONE branch's
      // revenue is what made a freshly-opened branch look catastrophically
      // unprofitable in its first month.
      this.getSalaryMonthly(
        companyId,
        month,
        performedById,
        singleBranchId(branchIds),
      ),
      this.getProfitLoss(companyId, scope),
      this.getPeriodOutflows(companyId, scope),
    ]);
    return buildNetProfit(pl, sm, outflows, month, recognizedRevenue);
  }

  /**
   * «Oyning o'z foydasi» — the month's own money against the month's own costs.
   * The ONE source for this figure: the Excel «Xulosa» sheet and the
   * /payments/overview Foyda card both read it here, so a month can never be
   * shown as self-sustaining on one surface and loss-making on the other.
   */
  async getOwnMonthProfit(
    companyId: number,
    {
      month,
      branchIds,
      performedById,
    }: { month: string; branchIds: ReportBranchIds; performedById: number },
  ): Promise<{
    month: string;
    ownMoney: number;
    cashTotal: number;
    netProfit: NetProfit;
    ownMonthProfit: number;
  }> {
    // Same fail-closed stance as getMonthlyNetProfit: a caller scoped to
    // nothing gets zeros, never a report built from someone else's branch.
    if (isEmptyScope(branchIds)) {
      const empty = buildNetProfit(null, null, null, month, 0);
      return {
        month,
        ownMoney: 0,
        cashTotal: 0,
        netProfit: empty,
        ownMonthProfit: 0,
      };
    }
    const [y, m] = month.split('-').map(Number);
    const startDate = `${month}-01`;
    const endDate = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    const [attribution, netProfit] = await Promise.all([
      this.getIncomeMonthAttribution(companyId, { branchIds, startDate, endDate }),
      this.getMonthlyNetProfit(companyId, { month, branchIds, performedById }),
    ]);
    return {
      month,
      ownMoney: attribution.currentMonth,
      cashTotal: attribution.total,
      netProfit,
      ownMonthProfit: computeOwnMonthProfit(attribution.currentMonth, netProfit),
    };
  }

  getDebtorLineItems(companyId: number, branchIds?: number[]) {
    return this.debtors.getDebtorLineItems(companyId, branchIds);
  }
  getPerBranchSummary(
    companyId: number,
    query: { startDate?: string; endDate?: string },
  ) {
    return this.payments.getPerBranchSummary(companyId, query);
  }
  getReconciliation(
    companyId: number,
    query: {
      branchIds: ReportBranchIds;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.financial.getReconciliation(companyId, query);
  }
  getPriorPeriodSummary(companyId: number, query: ReportScopeQuery) {
    return this.financial.getPriorPeriodSummary(companyId, query);
  }
  // Period outflows the two netProfit figures miss (refunds / write-offs /
  // gateway fees) — feed the Excel "Sof foyda" block.
  getPeriodOutflows(
    companyId: number,
    query: {
      branchIds: ReportBranchIds;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.financial.getPeriodOutflows(companyId, query);
  }

  // Financial statements (Phase 1)
  getProfitLoss(companyId: number, query: ProfitLossQuery) {
    return this.profitLoss.getProfitLoss(companyId, query);
  }
  getCashFlow(companyId: number, query: CashFlowQuery) {
    return this.cashFlow.getCashFlow(companyId, query);
  }
  getBalanceSheet(companyId: number, query: BalanceSheetQuery) {
    return this.balanceSheet.getBalanceSheet(companyId, query);
  }

  // Center activity
  getCenterActivity(companyId: number, query: CenterActivityQueryDto) {
    return this.centerActivity.getCenterActivity(companyId, query);
  }

  // Overview
  getKpis(companyId: number, query: ReportsQueryDto) {
    return this.overview.getKpis(companyId, query);
  }
  getRoomUtilization(companyId: number, query: ReportsQueryDto) {
    return this.overview.getRoomUtilization(companyId, query);
  }
  getGroupAnalytics(companyId: number, query: ReportsQueryDto) {
    return this.overview.getGroupAnalytics(companyId, query);
  }
  getLeadAnalytics(query: ReportsQueryDto) {
    return this.overview.getLeadAnalytics(query);
  }

  // Attendance analytics
  getTeacherPerformance(
    companyId: number,
    query: AttendanceTeacherPerfQueryDto,
  ) {
    return this.attendanceAnalytics.getTeacherPerformance(companyId, query);
  }
  getAttendanceAnalytics(
    companyId: number,
    query: AttendanceAnalyticsQueryDto,
  ) {
    return this.attendanceAnalytics.getAttendanceAnalytics(companyId, query);
  }
  getAttendanceByGroup(companyId: number, query: AttendanceByGroupQueryDto) {
    return this.attendanceAnalytics.getAttendanceByGroup(companyId, query);
  }
  getAttendanceByCourse(companyId: number, query: AttendanceByCourseQueryDto) {
    return this.attendanceAnalytics.getAttendanceByCourse(companyId, query);
  }

  // Financial
  /**
   * «Oy oxiriga kutilyapti» — the replacement for `recognizedRevenueForecast`.
   *
   * Lesson value, not cash: a cash projection would need an "about 82% gets
   * paid" coefficient drawn from two months, and that coefficient bundles
   * prepayment timing, debt and new-enrolment cycles into one number nobody can
   * decompose when it comes out wrong.
   */
  getMonthlyExpectation(
    companyId: number,
    opts: { month: string; branchIds: ReportBranchIds; asOf?: string },
  ) {
    return this.expectation.getMonthlyExpectation(companyId, opts);
  }

  /**
   * How «Oy oxiriga kutilyapti» moved day by day this month — straight from
   * `DailyFinancialSnapshot`. Missing days stay missing; a reconstructed point
   * would be a different claim wearing the same shape.
   */
  getExpectationHistory(
    companyId: number,
    opts: { month: string; branchIds: ReportBranchIds },
  ) {
    return this.expectationHistory.getMonthlyHistory(companyId, opts);
  }

  // Student figures for the Excel «O'quvchilar» sheet — see
  // reports-student-flow.service.ts for why this exists.
  getStudentFlow(
    companyId: number,
    opts: { month: string; branchIds: ReportBranchIds },
  ) {
    return this.studentFlow.getStudentFlow(companyId, opts);
  }

  async getFinancialOverview(
    companyId: number,
    query: {
      branchIds: ReportBranchIds;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const overview = await this.financial.getFinancialOverview(
      companyId,
      query,
    );
    // Month = the period's START month, the same derivation the salary fold and
    // the Excel `monthStr` already use. Audit H22 (cards sitting on different
    // bases) is a known separate item — do not diverge from the convention here.
    const month = (
      query.startDate ?? new Date().toISOString().slice(0, 10)
    ).slice(0, 7);
    const expectation = await this.getMonthlyExpectation(companyId, {
      month,
      branchIds: query.branchIds,
    });
    return {
      ...overview,
      income: { ...overview.income, expected: expectation.expectedValue },
      forecast: {
        ...overview.forecast,
        expectedMonthEnd: expectation.expectedValue,
        expectedHeld: expectation.heldValue,
        expectedRemaining: expectation.remainingValue,
      },
    };
  }
  getFinancialTrend(companyId: number, branchIds: ReportBranchIds) {
    return this.financial.getFinancialTrend(companyId, branchIds);
  }

  /**
   * The trend series with `profit` replaced by the CANONICAL monthly net profit
   * — the same figure the Foyda card and the Excel «Sof foyda» sheet show.
   *
   * The raw series computes profit on a cash basis, so opening the chart behind
   * the Foyda card used to show a different number than the card itself. Doing
   * it properly means one `getMonthlyNetProfit` per month, which is why it was
   * left cheap; a per-month DAY cache makes it affordable (see
   * `net-profit-cache.ts`). The first chart open of the Tashkent day pays,
   * later ones are free.
   *
   * Any month whose canonical figure cannot be produced keeps its cash value
   * and is flagged, so a failure degrades one point rather than the chart.
   */
  async getFinancialTrendCanonical(
    companyId: number,
    branchIds: ReportBranchIds,
    performedById: number,
  ) {
    const rows = await this.financial.getFinancialTrend(companyId, branchIds);
    // Cache key needs ONE id; a multi-branch scope has none, so those callers
    // recompute rather than share a key that would collide with a single
    // branch's entry.
    const cacheBranch = singleBranchId(branchIds);
    return Promise.all(
      rows.map(async (row: any) => {
        try {
          const profit = await cachedNetProfit(
            this.redis,
            companyId,
            cacheBranch,
            row.monthKey,
            async () => {
              const np = await this.getMonthlyNetProfit(companyId, {
                month: row.monthKey,
                branchIds,
                performedById,
              });
              return np.netProfit;
            },
          );
          return { ...row, profit, profitBasis: 'kanonik' as const };
        } catch {
          return { ...row, profitBasis: 'kassa' as const };
        }
      }),
    );
  }
  getIncomeMonthAttribution(
    companyId: number,
    query: {
      branchIds: ReportBranchIds;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.financial.getIncomeMonthAttribution(companyId, query);
  }
  getYearlyTrend(companyId: number, branchIds: ReportBranchIds) {
    return this.financial.getYearlyTrend(companyId, branchIds);
  }
  getMonthlyDebtRecovery(companyId: number, scope: ReportBranchIds) {
    return this.financial.getMonthlyDebtRecovery(companyId, scope);
  }
  /**
   * The /payments/debt-history page's whole dataset — roll-forward, cohort and
   * longest-standing debtors from one ledger replay. Distinct from
   * `getMonthlyDebtRecovery` (cohort only), which the Excel workbook still uses.
   */
  getDebtHistory(
    companyId: number,
    scope: ReportBranchIds,
    statusFilter?: DebtStatusFilter,
  ) {
    return this.debtHistory.getDebtHistory(companyId, scope, statusFilter);
  }
  /** Who still owes money that arose in one given month (debt aging). */
  getMonthAgingDetail(
    companyId: number,
    monthKey: string,
    scope: ReportBranchIds,
    statusFilter?: DebtStatusFilter,
  ) {
    return this.debtHistory.getMonthAgingDetail(
      companyId,
      monthKey,
      scope,
      statusFilter,
    );
  }
  getMonthDebtDetail(
    companyId: number,
    monthKey: string,
    scope: ReportBranchIds,
  ) {
    return this.financial.getMonthDebtDetail(companyId, monthKey, scope);
  }
  getDebtWriteOffsSummary(
    companyId: number,
    // Required, not optional — the facade was the place the missing scope
    // could still slip through.
    options: Parameters<
      ReportsFinancialService['getDebtWriteOffsSummary']
    >[1],
  ) {
    return this.financial.getDebtWriteOffsSummary(companyId, options);
  }

  // Payments
  getPaymentReports(
    companyId: number,
    options: {
      branchId?: number;
      startDate?: string;
      endDate?: string;
      months?: 3 | 6;
    },
  ) {
    return this.payments.getPaymentReports(companyId, options);
  }
  isPaymentOnTime(payment: {
    studentId: number;
    createdAt: Date;
    contractId: string | null;
    contract: {
      groupId: string | null;
      course: { lessonPaymentCount: number };
    } | null;
  }) {
    return this.payments.isPaymentOnTime(payment);
  }

  // Teacher payments
  getTeacherPaymentReports(
    companyId: number,
    options: { branchId?: number; startDate?: string; endDate?: string },
  ) {
    return this.teacherPayments.getTeacherPaymentReports(companyId, options);
  }
  getTeacherGroupsReport(
    companyId: number,
    teacherId: number,
    options: { branchId?: number; startDate?: string; endDate?: string },
  ) {
    return this.teacherPayments.getTeacherGroupsReport(
      companyId,
      teacherId,
      options,
    );
  }

  // Student payments
  getStudentPaymentsReport(
    companyId: number,
    params: {
      branchId?: number;
      groupIds?: string[];
      teacherIds?: number[];
      methods?: ('CASH' | 'PAYME' | 'CLICK' | 'UZUM' | 'TRANSFER')[];
      courseId?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    return this.studentPayments.getStudentPaymentsReport(companyId, params);
  }
  getStudentPaymentsFilterOptions(
    companyId: number,
    scope: ReportBranchIds,
  ) {
    return this.studentPayments.getStudentPaymentsFilterOptions(companyId, scope);
  }

  // Departed students — core
  getDepartedStudentsSummary(
    companyId: number,
    params: { branchId?: number; startDate: string; endDate: string },
  ) {
    return this.departedStudents.getDepartedStudentsSummary(companyId, params);
  }
  getDepartedStudentsDynamics(
    companyId: number,
    params: { branchId?: number },
  ) {
    return this.departedStudents.getDepartedStudentsDynamics(companyId, params);
  }
  getDepartedStudentsList(
    companyId: number,
    params: {
      branchId?: number;
      status?: StudentStatus;
      debtorsOnly?: boolean;
      page?: number;
      pageSize?: number;
    },
  ) {
    return this.departedLists.getDepartedStudentsList(companyId, params);
  }
  getDepartedStudentsByReason(
    companyId: number,
    params: {
      branchId?: number;
      courseId?: string;
      teacherIds?: number[];
      startDate: string;
      endDate: string;
      page?: number;
      pageSize?: number;
      departureReasonId?: string;
    },
  ) {
    return this.departedLists.getDepartedStudentsByReason(companyId, params);
  }
  getDepartedStudentsByStatus(
    companyId: number,
    params: { branchId?: number },
  ) {
    return this.departedLists.getDepartedStudentsByStatus(companyId, params);
  }
  getDepartedStudentsGroupBy(
    companyId: number,
    params: {
      branchId?: number;
      groupBy: 'course' | 'teacher' | 'branch';
    },
  ) {
    return this.departedLists.getDepartedStudentsGroupBy(companyId, params);
  }

  // Departed reasons (3 charts)
  getDepartedStudentsReasons(
    companyId: number,
    params: {
      branchId?: number;
      courseId?: string;
      teacherIds?: number[];
      startDate: string;
      endDate: string;
    },
  ) {
    return this.departedReasons.getDepartedStudentsReasons(companyId, params);
  }
  getTeacherChangeReasons(
    companyId: number,
    params: {
      branchId?: number;
      courseId?: string;
      teacherIds?: number[];
      startDate: string;
      endDate: string;
    },
  ) {
    return this.departedReasons.getTeacherChangeReasons(companyId, params);
  }
  getTransferReasons(
    companyId: number,
    params: {
      branchId?: number;
      courseId?: string;
      teacherIds?: number[];
      startDate: string;
      endDate: string;
    },
  ) {
    return this.departedReasons.getTransferReasons(companyId, params);
  }

  // Teacher changes drill-downs
  getTeacherChangesList(
    companyId: number,
    params: {
      branchId?: number;
      courseId?: string;
      teacherIds?: number[];
      startDate: string;
      endDate: string;
      reasonId?: string;
    },
  ) {
    return this.teacherChanges.getTeacherChangesList(companyId, params);
  }
  getTransferredList(
    companyId: number,
    params: {
      branchId?: number;
      courseId?: string;
      teacherIds?: number[];
      startDate: string;
      endDate: string;
      page?: number;
      pageSize?: number;
      transferReasonId?: string;
    },
  ) {
    return this.teacherChanges.getTransferredList(companyId, params);
  }
  getDepartedAfterTeacherChangeList(
    companyId: number,
    params: { branchId?: number; startDate: string; endDate: string },
  ) {
    return this.teacherChanges.getDepartedAfterTeacherChangeList(
      companyId,
      params,
    );
  }
}
