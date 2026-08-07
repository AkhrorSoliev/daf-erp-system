import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { ReportsQueryDto } from './dto/reports-query.dto';
import { ExpectationHistoryQueryDto } from './dto/expectation-history-query.dto';
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

@Controller('reports')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly prisma: PrismaService,
    private readonly reportsExcelService: ReportsExcelService,
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

  // 6-month KPI trend chart (income/expenses/profit/LTV/CAC/ROI series).
  // CEO/BD only — the drill-down is hidden from Administrators on the frontend,
  // so the endpoint must reject them too (money-series data).
  @Get('financial-trend')
  @Roles('CEO', 'Branch Director')
  async getFinancialTrend(
    @Query() query: ReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    const branchIds = await this.resolveScope(userId, query.branchId);
    // Canonical profit per month, day-cached — so the chart behind the Foyda
    // card plots the same figure the card shows instead of a cash proxy.
    return this.reportsService.getFinancialTrendCanonical(
      companyId,
      branchIds,
      userId,
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

  // Financial overview KPI cards. CEO/BD get the full payload (income, expenses,
  // profit, salary, LTV, CAC, ROI, forecast, debt). Administrator + Cashier are
  // intentionally allowed to reach it — but only for the two OPERATIONAL figures
  // the frontend still shows them ("To'lov qilganlar" = payer count, "O'rtacha
  // to'lov" = avg payment). Every sensitive money metric is stripped here at the
  // HTTP boundary so a direct API call can't leak it (frontend hiding alone is
  // not a security boundary).
  @Get('financial-overview')
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  async getFinancialOverview(
    @Query() query: ReportsQueryDto,
    @CurrentUser() user: { id: number; companyId: number; roles: string[] },
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

    const canSeeFinancials = user.roles.some(
      (r) => r === 'CEO' || r === 'Branch Director',
    );
    if (!canSeeFinancials) {
      // Operational-only subset for Administrator / Cashier. Nothing that reveals
      // company revenue, cost, profit, salary, marketing or debt is returned.
      return {
        ltvPayerCount: overview.ltvPayerCount,
        avgPayment: overview.avgPayment,
      };
    }

    // Computed monthly teacher salary — the SAME figure the downloaded Excel
    // "Oyliklar" sheet and the /payments/salary page show (`getMonthly`). Folded
    // in so the overview's "Ustoz oyliklari" card matches the Excel exactly:
    //   • netToPay  = sof to'lanadigan (avans ayirilgan) — what teachers receive
    //   • advances  = shu oydagi avanslar jami
    //   • gross     = netToPay + advances (avans + oylik jami)
    // Month = the period's START month, mirroring the Excel's `monthStr`
    // derivation (`ReportsExcelService.generate`). This is the HISOBLANGAN
    // (accrual) salary for the month — deliberately a different basis from the
    // cash-paid `salary.paid` that feeds `netProfit`. Caller id drives branch
    // scope (CEO/BD → same scope as their salary page). Defensive: a salary-calc
    // failure must degrade to `computed: null`, never break the whole overview.
    const now = new Date();
    const month = query.startDate
      ? query.startDate.slice(0, 7)
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let computed: {
      month: string;
      hasLessonData: boolean;
      netToPay: number;
      advances: number;
      gross: number;
    } | null = null;
    try {
      // Branch-scoped like every other figure on this card — an "Oyliklar"
      // block showing company-wide payroll next to one branch's income is how
      // the profit number went wrong in the first place.
      const sm = await this.reportsService.getSalaryMonthly(
        user.companyId,
        month,
        user.id,
        query.branchId,
      );
      const t = sm.totals;
      // Config-gap / manual months (e.g. May cutover) have no per-lesson data —
      // the deserved/covered/centerFunded columns come back as 0 there; the card
      // renders a "o'tish oyi" note instead of a fake 0, mirroring the Excel "—".
      const hasLessonData =
        (t.fullDeserved ?? 0) !== 0 ||
        (t.covered ?? 0) !== 0 ||
        (t.centerFunded ?? 0) !== 0;
      computed = {
        month: sm.month,
        hasLessonData,
        netToPay: t.netToPay,
        advances: t.advances,
        gross: t.netToPay + t.advances,
      };
    } catch {
      computed = null;
    }

    // Corrected "Foyda" — the SAME canonical figure as the Excel "Sof foyda":
    //   dars tushumi (recognized — shu oy o'tilgan darslar)
    //   − ustoz oyligi (covered + markaz qo'shimchasi, faqat 2026-07 dan)
    //   − admin oyligi − operatsion xarajat − refund.
    // The legacy overview.netProfit (kassa tushumi − NAQD to'langan oylik)
    // grossly overstated profit: teacher salary is paid next cycle, so its
    // paidAt-based figure was ~0 and barely reduced profit (the +78M June bug).
    // Defensive: a failure keeps the legacy figure, never breaks the overview.
    let netProfit = overview.netProfit;
    try {
      const np = await this.reportsService.getMonthlyNetProfit(user.companyId, {
        month,
        branchIds,
        performedById: user.id,
      });
      netProfit = np.netProfit;
    } catch {
      netProfit = overview.netProfit;
    }

    // «Oyning o'z foydasi» — the month's own money against its own costs.
    // A positive Foyda card can still sit on a month that did not pay for
    // itself (June 2026: profit +4.7M, own-month −26.8M, propped up by May
    // debt recovery). Defensive: a failure yields null, never breaks the card.
    let ownMonthProfit: number | null = null;
    try {
      const own = await this.reportsService.getOwnMonthProfit(user.companyId, {
        month,
        branchIds,
        performedById: user.id,
      });
      ownMonthProfit = own.ownMonthProfit;
    } catch {
      ownMonthProfit = null;
    }

    return {
      ...overview,
      netProfit,
      ownMonthProfit,
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
    @Query() query: ExpectationHistoryQueryDto,
  ) {
    return this.reportsService.getExpectationHistory(companyId, {
      // Its own DTO, not `ReportsQueryDto`: the global ValidationPipe runs with
      // `forbidNonWhitelisted`, so a `month` the shared DTO does not declare is
      // a 400 — which is how this shipped broken.
      month: query.month ?? new Date().toISOString().slice(0, 7),
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

  // Dedicated Excel workbook for the debt-history page (Umumiy + Qarzdorlar +
  // Undirildi + Kechirilgan sheets). CEO/BD only. Note: this static route must
  // be declared BEFORE the ":monthKey" param route so "excel" isn't captured.
  @Get('monthly-debt-recovery/excel')
  @Roles('CEO', 'Branch Director')
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
  @Roles('CEO', 'Branch Director')
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
  @Roles('CEO', 'Branch Director')
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

  @Get('payment-reports')
  @Roles('CEO', 'Branch Director')
  getPaymentReports(
    @Query() query: PaymentReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getPaymentReports(companyId, {
      branchId: this.scoped(query, scope).branchId,
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
      branchId: this.scoped(query, scope).branchId,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('departed-students/dynamics')
  getDepartedStudentsDynamics(
    @Query() query: DepartedStudentsBranchQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getDepartedStudentsDynamics(companyId, {
      branchId: this.scoped(query, scope).branchId,
    });
  }

  @Get('departed-students/by-status')
  getDepartedStudentsByStatus(
    @Query() query: DepartedStudentsBranchQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getDepartedStudentsByStatus(companyId, {
      branchId: this.scoped(query, scope).branchId,
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
      branchId: this.scoped(query, scope).branchId,
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
      branchId: this.scoped(query, scope).branchId,
      groupBy: query.groupBy,
    });
  }

  @Get('departed-students/teacher-changes-list')
  getTeacherChangesList(
    @Query() query: DepartedStudentsSummaryQueryDto & { reasonId?: string },
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
    @Query()
    query: DepartedStudentsSummaryQueryDto & {
      page?: number;
      pageSize?: number;
      transferReasonId?: string;
    },
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getTransferredList(companyId, {
      branchId: this.scoped(query, scope).branchId,
      courseId: query.courseId,
      teacherIds: query.teacherIds,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
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
    return this.reportsService.getStudentPaymentsFilterOptions(companyId, scope);
  }
}
