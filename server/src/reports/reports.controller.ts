import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { ReportsQueryDto } from './dto/reports-query.dto';
import { MonthQueryDto } from './dto/month-query.dto';
import { DebtHistoryQueryDto } from './dto/debt-history-query.dto';
import {
  isEmptyScope,
  narrowToSingleBranch,
  resolveCallerReportBranchIds,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { PaymentReportsQueryDto } from './dto/payment-reports-query.dto';
import { StudentPaymentsReportQueryDto } from './dto/student-payments-report-query.dto';
import { DepartedStudentsSummaryQueryDto } from './dto/departed-students-summary-query.dto';
import { DepartedStudentsGroupByQueryDto } from './dto/departed-students-group-by-query.dto';
import { DepartedStudentsListQueryDto } from './dto/departed-students-list-query.dto';
import { DepartedStudentsByReasonQueryDto } from './dto/departed-students-by-reason-query.dto';
import { DepartedStudentsBranchQueryDto } from './dto/departed-students-branch-query.dto';
import { DepartedStudentsRangeQueryDto } from './dto/departed-students-range-query.dto';
import { DepartedStudentsTeacherChangesQueryDto } from './dto/departed-students-teacher-changes-query.dto';
import { DepartedStudentsTransferredQueryDto } from './dto/departed-students-transferred-query.dto';
import { CenterActivityQueryDto } from './dto/center-activity-query.dto';
import {
  AttendanceAnalyticsQueryDto,
  AttendanceByCourseQueryDto,
  AttendanceByGroupQueryDto,
  AttendanceTeacherPerfQueryDto,
} from './dto/attendance-reports-query.dto';
import { Roles, CurrentUser, BranchScope } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsExcelService } from './reports-excel.service';
import { ReportsProfitCompositionService } from './reports-profit-composition.service';
import { tashkentDateStr, tashkentMonthKey } from '../common/date/tashkent';

@Controller('reports')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);

  constructor(
    private readonly reportsService: ReportsService,
    private readonly prisma: PrismaService,
    private readonly reportsExcelService: ReportsExcelService,
    private readonly profitComposition: ReportsProfitCompositionService,
  ) {}

  @Get('kpis')
  getKpis(
    @Query() query: ReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getKpis(companyId, this.scoped(query, scope));
  }

  @Get('room-utilization')
  getRoomUtilization(
    @Query() query: ReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getRoomUtilization(
      companyId,
      this.scoped(query, scope),
    );
  }

  @Get('center-activity')
  getCenterActivity(
    @Query() query: CenterActivityQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getCenterActivity(
      companyId,
      this.scoped(query, scope),
    );
  }

  @Get('teacher-performance')
  getTeacherPerformance(
    @Query() query: AttendanceTeacherPerfQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getTeacherPerformance(
      companyId,
      this.scoped(query, scope),
    );
  }

  @Get('attendance-analytics')
  getAttendanceAnalytics(
    @Query() query: AttendanceAnalyticsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getAttendanceAnalytics(
      companyId,
      this.scoped(query, scope),
    );
  }

  @Get('attendance-by-group')
  getAttendanceByGroup(
    @Query() query: AttendanceByGroupQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getAttendanceByGroup(
      companyId,
      this.scoped(query, scope),
    );
  }

  @Get('attendance-by-course')
  getAttendanceByCourse(
    @Query() query: AttendanceByCourseQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getAttendanceByCourse(
      companyId,
      this.scoped(query, scope),
    );
  }

  @Get('group-analytics')
  getGroupAnalytics(
    @Query() query: ReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getGroupAnalytics(
      companyId,
      this.scoped(query, scope),
    );
  }

  @Get('lead-analytics')
  getLeadAnalytics(@Query() query: ReportsQueryDto) {
    return this.reportsService.getLeadAnalytics(query);
  }

  // The «Oylar bo'yicha» table of /payments/overview and the home chart: six
  // months of cash and canonical profit, ending at `?month=` (default: now).
  // CEO/BD only — money series.
  @Get('financial-trend')
  @Roles('CEO', 'Branch Director')
  async getFinancialTrend(
    @Query() query: MonthQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    const branchIds = await this.resolveScope(userId, query.branchId);
    // Canonical profit per month, day-cached — the figure the profit card shows.
    return this.reportsService.getFinancialTrendCanonical(
      companyId,
      branchIds,
      userId,
      query.month,
    );
  }

  // Income composition for the selected period (the "Tushumlar" card drill-down):
  // how much of the cash received is REAL income for the period's own month vs
  // LATE payments settling debt carried in from prior months (broken out by
  // month). Money breakdown → CEO/BD only, like `financial-trend`.
  @Get('income-month-attribution')
  @Roles('CEO', 'Branch Director')
  async getIncomeMonthAttribution(
    @Query() query: ReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.reportsService.getIncomeMonthAttribution(companyId, {
      branchIds: await this.resolveScope(userId, query.branchId),
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  // «Foyda tarkibi» — what the Foyda card's figure is made of and what the
  // month is on course to close at (the card's click-through panel). Month =
  // the period's START month, the same rule the card uses. Money breakdown →
  // CEO/BD only, like the card itself.
  @Get('profit-composition')
  @Roles('CEO', 'Branch Director')
  async getProfitComposition(
    @Query() query: ReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    const month = query.startDate
      ? query.startDate.slice(0, 7)
      : tashkentDateStr(new Date()).slice(0, 7);
    return this.profitComposition.getProfitComposition(companyId, {
      month,
      branchIds: await this.resolveScope(userId, query.branchId),
      performedById: userId,
    });
  }

  // «Umumiy ma'lumotlar» — CEO and Branch Director only (ADR-0067). The page
  // shows Administrator and Cashier only «To'lov qayd qilish» and the recent
  // payments and does not call this; the two cards they used to get from here
  // («To'lov qilganlar», «O'rtacha to'lov») were removed, and the redaction
  // branch with them.
  @Get('financial-overview')
  @Roles('CEO', 'Branch Director')
  async getFinancialOverview(
    @Query() query: ReportsQueryDto,
    @CurrentUser() user: { id: number; companyId: number },
  ) {
    const branchIds = await this.resolveScope(user.id, query.branchId);
    const overview = await this.reportsService.getFinancialOverview(
      user.companyId,
      {
        branchIds,
        startDate: query.startDate,
        endDate: query.endDate,
      },
    );

    // «Oyliklar» card: the month's salary from `getMonthly` — the SAME source
    // as the /payments/salary page and the Excel «Oyliklar» sheet: teachers'
    // `fullDeserved` / `netToPay` / `advances` and the non-teaching staff's
    // `staffTotals`. Month = the period's START month (the Excel `monthStr`
    // rule); with no period the current TASHKENT month — `getFullYear()` /
    // `getMonth()` read the process timezone, UTC on Railway, and said last
    // month until 05:00 on the 1st. A salary-calc failure degrades to `null`,
    // never breaks the overview.
    const month = query.startDate
      ? query.startDate.slice(0, 7)
      : tashkentMonthKey(new Date());
    let computed: {
      month: string;
      hasLessonData: boolean;
      fullDeserved: number;
      netToPay: number;
      advances: number;
      staff: { monthly: number; advances: number; netToPay: number };
    } | null = null;
    try {
      // Branch-scoped like every other figure here: payroll resolves the
      // caller's own branch set from `user.id`.
      const sm = await this.reportsService.getSalaryMonthly(
        user.companyId,
        month,
        user.id,
        query.branchId,
      );
      const t = sm.totals;
      // Config-gap / manual months (the May cutover) have no per-lesson data:
      // the card prints «—» and «o'tish oyi» instead of a fake 0.
      const hasLessonData =
        (t.fullDeserved ?? 0) !== 0 ||
        (t.covered ?? 0) !== 0 ||
        (t.centerFunded ?? 0) !== 0;
      computed = {
        month: sm.month,
        hasLessonData,
        fullDeserved: t.fullDeserved,
        netToPay: t.netToPay,
        advances: t.advances,
        staff: {
          monthly: sm.staffTotals.monthly,
          advances: sm.staffTotals.advances,
          netToPay: sm.staffTotals.netToPay,
        },
      };
    } catch {
      computed = null;
    }

    // Kanonik «Foyda» — Excel «Sof foyda» bilan bir xil raqam. «Kanonik yoki
    // kassa» qarori `ReportsService.getNetProfitWithBasis` da turadi; a
    // failure returns the cash figure labelled `cash`, never silently.
    const { netProfit, netProfitBasis } =
      await this.reportsService.getNetProfitWithBasis(user.companyId, {
        month,
        branchIds,
        performedById: user.id,
        cashFallback: overview.netProfit,
      });

    return {
      ...overview,
      netProfit,
      netProfitBasis,
      salary: { ...overview.salary, computed },
    };
  }

  // How «Oy oxiriga kutilyapti» moved day by day this month, read back from the
  // daily snapshot. CEO + BD only — same gate as every other money figure.
  // Missing days are returned as missing; nothing is reconstructed.
  @Get('expectation-history')
  @Roles('CEO', 'Branch Director')
  async getExpectationHistory(
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @Query() query: MonthQueryDto,
  ) {
    return this.reportsService.getExpectationHistory(companyId, {
      // Its own DTO, not `ReportsQueryDto`: the global ValidationPipe runs with
      // `forbidNonWhitelisted`, so a `month` the shared DTO does not declare is
      // a 400 — which is how this shipped broken.
      month: query.month ?? tashkentMonthKey(new Date()),
      branchIds: await this.resolveScope(userId, query.branchId),
    });
  }

  // "Oylik qarzdorlik + undirish" — per-month closing debt (frozen, ledger-
  // reconstructed) + how much of each month's cohort has since been recovered.
  // Company-wide (student balances aren't cleanly branch-scoped). CEO + BD only
  // — Administrators shouldn't see company-wide debt aggregates.
  @Get('monthly-debt-recovery')
  @Roles('CEO', 'Branch Director')
  getMonthlyDebtRecovery(
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getMonthlyDebtRecovery(companyId, scope);
  }

  // Everything the /payments/debt-history page renders, from ONE ledger replay:
  // the month-by-month debt roll-forward (opening + added − paid − forgiven −
  // other = closing), each month's cohort recovery, the current status split
  // and the longest-standing debtors. CEO + BD only — company-wide debt.
  //
  // Declared BEFORE the ":monthKey" param route so "history" isn't captured.
  @Get('monthly-debt-recovery/history')
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  getDebtHistory(
    @Query() query: DebtHistoryQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getDebtHistory(companyId, scope, query.status);
  }

  // Who still owes money that arose in ONE month — the page's month dialog.
  // Distinct from the cohort ":monthKey/detail" below, which answers "who ended
  // that month in debt"; this answers "whose charges FROM that month are still
  // unpaid", so the same student shows a different figure under each month.
  @Get('monthly-debt-recovery/:monthKey/aging')
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  getMonthAgingDetail(
    @Param('monthKey') monthKey: string,
    @Query() query: DebtHistoryQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
      throw new BadRequestException('monthKey formati YYYY-MM bo‘lishi kerak');
    }
    // Returns debtor NAMES and PHONES — it must never span branches for a
    // confined caller.
    return this.reportsService.getMonthAgingDetail(
      companyId,
      monthKey,
      scope,
      query.status,
    );
  }

  // Dedicated Excel workbook for the debt-history page (Umumiy + Qarzdorlar +
  // Undirildi + Kechirilgan sheets). CEO/BD only. Note: this static route must
  // be declared BEFORE the ":monthKey" param route so "excel" isn't captured.
  @Get('monthly-debt-recovery/excel')
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  async exportMonthlyDebtExcel(
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsExcelService.generateDebtHistory(
      companyId,
      scope,
    );
    const filename = `oylik-qarzdorlik-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  // Per-month drill-down: who owed at month-end, who paid, who was written off.
  @Get('monthly-debt-recovery/:monthKey/detail')
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  getMonthDebtDetail(
    @Param('monthKey') monthKey: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
      throw new BadRequestException('monthKey formati YYYY-MM bo‘lishi kerak');
    }
    // The drill-down returns debtor NAMES and PHONES — it must never span
    // branches for a confined caller.
    return this.reportsService.getMonthDebtDetail(companyId, monthKey, scope);
  }

  // KPI summary for the "yo'qolgan o'quvchi" write-off flow — total
  // amount + operation count for the period. CEO sees the whole company;
  // Branch Director is auto-scoped to their UserBranch rows. Restricted
  // tighter than the class default since Administrators should not see
  // financial-correction aggregates.
  @Get('debt-write-offs-summary')
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  async getDebtWriteOffsSummary(
    @Query() query: ReportsQueryDto,
    @CurrentUser()
    user: { id: number; companyId: number; roles: string[] },
  ) {
    const branchIds = await this.resolveScope(user.id, query.branchId);
    return this.reportsService.getDebtWriteOffsSummary(user.companyId, {
      branchIds,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  // The "Hisobot" Excel workbook — CEO + BD only. Ten sheets by default;
  // `?include=buxgalteriya,marketing,qarzdorlar` bolts on the opt-in groups.
  // Auth-gated by @Roles; the frontend fetches it as a blob.
  @Get('financial-excel')
  @Roles('CEO', 'Branch Director')
  async exportFinancialExcel(
    @Query() query: ReportsQueryDto,
    @CurrentUser() user: { id: number; companyId: number; roles: string[] },
    @Res() res: Response,
  ) {
    // ONE scope for the whole workbook — cover page included, so the label can
    // never name a branch the sheets were not built from.
    const scope = await this.resolveScope(user.id, query.branchId);
    const [company, branches] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true },
      }),
      this.prisma.branch.findMany({
        where: { companyId: user.companyId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);
    const branchNames: Record<number, string> = Object.fromEntries(
      branches.map((b) => [b.id, b.name]),
    );
    const branchLabel =
      scope === null
        ? 'Barcha filiallar'
        : scope.map((id) => branchNames[id] ?? `Filial #${id}`).join(', ');

    // Opt-in sheet groups: CSV of the three known tokens. Unknown tokens are
    // dropped rather than refused — a stale bookmark should still download the
    // ten-sheet default report, not fail.
    const validGroups = ['buxgalteriya', 'marketing', 'qarzdorlar'];
    const include = (query.include ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => validGroups.includes(s));

    const buffer = await this.reportsExcelService.generate(user.companyId, {
      branchIds: scope,
      startDate: query.startDate,
      endDate: query.endDate,
      companyName: company?.name ?? 'DaF Sprachzentrum',
      branchLabel,
      branchNames,
      performedById: user.id,
      include,
    });
    // The dates land in a response header, so they are stripped down to the
    // characters a date can contain — a quote or newline in the query string
    // must never be able to shape `Content-Disposition`.
    const stamp =
      [query.startDate, query.endDate]
        .filter((d): d is string => !!d)
        .map((d) => d.replace(/[^0-9A-Za-z-]/g, ''))
        .join('_') || new Date().toISOString().slice(0, 10);
    const filename = `hisobot-${stamp}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  /**
   * The caller's scope intersected with the branch they picked — the ONE
   * answer every money endpoint in this controller passes down.
   *
   * A confined caller with no branch in scope is REFUSED rather than served a
   * zero-filled report: some downstream services re-derive their own scope from
   * `performedById` and would fill part of that report with the caller's own
   * branch, producing a document that is internally inconsistent and looks like
   * a catastrophic loss.
   */
  private async resolveScope(
    userId: number,
    requestedBranchId?: number,
  ): Promise<ReportBranchIds> {
    const ids = await resolveCallerReportBranchIds(
      this.prisma,
      userId,
      requestedBranchId,
    );
    if (isEmptyScope(ids)) {
      throw new ForbiddenException(
        "Bu filial ma'lumotlarini ko'rish huquqingiz yo'q",
      );
    }
    return ids;
  }

  /**
   * Replace a query's client-supplied `branchId` with the RESOLVED one.
   *
   * The operational reports below each take a single optional `branchId` and
   * used to read it straight off the query string — a widening parameter, so a
   * branch-confined caller got any branch they named and the whole company when
   * they named none. The guard has already intersected their ceiling with their
   * pick; this stamps that answer over whatever arrived.
   *
   * Returns a COPY. Mutating the DTO in place would leave the request object
   * disagreeing with what was validated, and makes the override invisible at
   * the call site.
   */
  private scoped<T extends { branchId?: number }>(
    query: T,
    scope: ReportBranchIds,
  ): T {
    return {
      ...query,
      branchId: narrowToSingleBranch(
        scope,
        () => {
          throw new ForbiddenException(
            "Bu filial ma'lumotlarini ko'rish huquqingiz yo'q",
          );
        },
        () => {
          throw new BadRequestException(
            'Bir nechta filialga kirish huquqingiz bor — filialni tanlang',
          );
        },
      ),
    };
  }

  /**
   * Hand a report the resolved scope as a LIST, so a caller with several
   * branches gets all of them rather than a 400 from `scoped()`. Used by the
   * departed-students reports (ADR-0035) and /payment-reports. An empty scope
   * is refused, never served as zeros (ADR-0002).
   */
  private listScope(scope: ReportBranchIds): ReportBranchIds {
    if (isEmptyScope(scope)) {
      throw new ForbiddenException(
        "Bu filial ma'lumotlarini ko'rish huquqingiz yo'q",
      );
    }
    return scope;
  }

  @Get('payment-reports')
  @Roles('CEO', 'Branch Director')
  getPaymentReports(
    @Query() query: PaymentReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getPaymentReports(companyId, {
      // Every leg filters with `branchIdWhere`, so the list is exact.
      branchIds: this.listScope(scope),
      startDate: query.startDate,
      endDate: query.endDate,
      months: query.months,
    });
  }

  @Get('payment-reports/teachers')
  @Roles('CEO', 'Branch Director')
  getTeacherPaymentReports(
    @Query() query: PaymentReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getTeacherPaymentReports(companyId, {
      branchId: this.scoped(query, scope).branchId,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('payment-reports/teachers/:teacherId/groups')
  @Roles('CEO', 'Branch Director')
  getTeacherGroupsReport(
    @Param('teacherId', ParseIntPipe) teacherId: number,
    @Query() query: PaymentReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getTeacherGroupsReport(companyId, teacherId, {
      branchId: this.scoped(query, scope).branchId,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('student-payments')
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  getStudentPaymentsReport(
    @Query() query: StudentPaymentsReportQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getStudentPaymentsReport(companyId, {
      branchId: this.scoped(query, scope).branchId,
      groupIds: query.groupIds,
      teacherIds: query.teacherIds,
      methods: query.methods,
      courseId: query.courseId,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('departed-students/summary')
  getDepartedStudentsSummary(
    @Query() query: DepartedStudentsSummaryQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getDepartedStudentsSummary(companyId, {
      scope: this.listScope(scope),
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('departed-students/dynamics')
  getDepartedStudentsDynamics(
    @Query() query: DepartedStudentsRangeQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getDepartedStudentsDynamics(companyId, {
      scope: this.listScope(scope),
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('departed-students/by-status')
  getDepartedStudentsByStatus(
    @Query() query: DepartedStudentsBranchQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getDepartedStudentsByStatus(companyId, {
      scope: this.listScope(scope),
    });
  }

  @Get('departed-students/reasons')
  getDepartedStudentsReasons(
    @Query() query: DepartedStudentsSummaryQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getDepartedStudentsReasons(companyId, {
      branchId: this.scoped(query, scope).branchId,
      courseId: query.courseId,
      teacherIds: query.teacherIds,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('departed-students/teacher-change-reasons')
  getTeacherChangeReasons(
    @Query() query: DepartedStudentsSummaryQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getTeacherChangeReasons(companyId, {
      branchId: this.scoped(query, scope).branchId,
      courseId: query.courseId,
      teacherIds: query.teacherIds,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('departed-students/transfer-reasons')
  getTransferReasons(
    @Query() query: DepartedStudentsSummaryQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getTransferReasons(companyId, {
      branchId: this.scoped(query, scope).branchId,
      courseId: query.courseId,
      teacherIds: query.teacherIds,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('departed-students/list')
  getDepartedStudentsList(
    @Query() query: DepartedStudentsListQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getDepartedStudentsList(companyId, {
      scope: this.listScope(scope),
      status: query.status,
      debtorsOnly: query.debtorsOnly,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('departed-students/by-reason')
  getDepartedStudentsByReason(
    @Query() query: DepartedStudentsByReasonQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getDepartedStudentsByReason(companyId, {
      branchId: this.scoped(query, scope).branchId,
      courseId: query.courseId,
      teacherIds: query.teacherIds,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page,
      pageSize: query.pageSize,
      departureReasonId: query.departureReasonId,
    });
  }

  @Get('departed-students/group-by')
  getDepartedStudentsGroupBy(
    @Query() query: DepartedStudentsGroupByQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getDepartedStudentsGroupBy(companyId, {
      scope: this.listScope(scope),
      groupBy: query.groupBy,
    });
  }

  @Get('departed-students/teacher-changes-list')
  getTeacherChangesList(
    @Query() query: DepartedStudentsTeacherChangesQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getTeacherChangesList(companyId, {
      branchId: this.scoped(query, scope).branchId,
      courseId: query.courseId,
      teacherIds: query.teacherIds,
      startDate: query.startDate,
      endDate: query.endDate,
      reasonId: query.reasonId,
    });
  }

  @Get('departed-students/transferred-list')
  getTransferredList(
    @Query() query: DepartedStudentsTransferredQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getTransferredList(companyId, {
      branchId: this.scoped(query, scope).branchId,
      courseId: query.courseId,
      teacherIds: query.teacherIds,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page,
      pageSize: query.pageSize,
      transferReasonId: query.transferReasonId,
    });
  }

  @Get('departed-students/departed-after-change')
  getDepartedAfterTeacherChangeList(
    @Query() query: DepartedStudentsSummaryQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getDepartedAfterTeacherChangeList(companyId, {
      branchId: this.scoped(query, scope).branchId,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('student-payments/filter-options')
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  getStudentPaymentsFilterOptions(
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getStudentPaymentsFilterOptions(
      companyId,
      scope,
    );
  }
}
