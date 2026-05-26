import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsQueryDto } from './dto/reports-query.dto';
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
import { Roles, CurrentUser } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { PrismaService } from '../prisma/prisma.service';

@Controller('reports')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('kpis')
  getKpis(
    @Query() query: ReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getKpis(companyId, query);
  }

  @Get('room-utilization')
  getRoomUtilization(
    @Query() query: ReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getRoomUtilization(companyId, query);
  }

  @Get('center-activity')
  getCenterActivity(
    @Query() query: CenterActivityQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getCenterActivity(companyId, query);
  }

  @Get('teacher-performance')
  getTeacherPerformance(
    @Query() query: AttendanceTeacherPerfQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getTeacherPerformance(companyId, query);
  }

  @Get('attendance-analytics')
  getAttendanceAnalytics(
    @Query() query: AttendanceAnalyticsQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getAttendanceAnalytics(companyId, query);
  }

  @Get('attendance-by-group')
  getAttendanceByGroup(
    @Query() query: AttendanceByGroupQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getAttendanceByGroup(companyId, query);
  }

  @Get('attendance-by-course')
  getAttendanceByCourse(
    @Query() query: AttendanceByCourseQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getAttendanceByCourse(companyId, query);
  }

  @Get('group-analytics')
  getGroupAnalytics(
    @Query() query: ReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getGroupAnalytics(companyId, query);
  }

  @Get('lead-analytics')
  getLeadAnalytics(@Query() query: ReportsQueryDto) {
    return this.reportsService.getLeadAnalytics(query);
  }

  @Get('financial-trend')
  getFinancialTrend(
    @Query() query: ReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getFinancialTrend(companyId, query.branchId);
  }

  @Get('financial-overview')
  getFinancialOverview(
    @Query() query: ReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getFinancialOverview(companyId, {
      branchId: query.branchId,
      startDate: query.startDate,
      endDate: query.endDate,
    });
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
    const branchIds = await this.resolveBranchScopeForUser(user);
    return this.reportsService.getDebtWriteOffsSummary(user.companyId, {
      branchId: query.branchId,
      branchIds: branchIds ?? undefined,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  /**
   * CEO: full company access (null = no branch filter).
   * Branch Director: explicit UserBranch rows.
   */
  private async resolveBranchScopeForUser(user: {
    id: number;
    roles: string[];
  }): Promise<number[] | null> {
    if (user.roles.includes('CEO')) return null;
    const rows = await this.prisma.userBranch.findMany({
      where: { userId: user.id },
      select: { branchId: true },
    });
    return rows.map((r) => r.branchId);
  }

  @Get('payment-reports')
  @Roles('CEO', 'Branch Director')
  getPaymentReports(
    @Query() query: PaymentReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getPaymentReports(companyId, {
      branchId: query.branchId,
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
  ) {
    return this.reportsService.getTeacherPaymentReports(companyId, {
      branchId: query.branchId,
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
  ) {
    return this.reportsService.getTeacherGroupsReport(companyId, teacherId, {
      branchId: query.branchId,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('student-payments')
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  getStudentPaymentsReport(
    @Query() query: StudentPaymentsReportQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getStudentPaymentsReport(companyId, {
      branchId: query.branchId,
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
  ) {
    return this.reportsService.getDepartedStudentsSummary(companyId, {
      branchId: query.branchId,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('departed-students/dynamics')
  getDepartedStudentsDynamics(
    @Query() query: DepartedStudentsBranchQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getDepartedStudentsDynamics(companyId, {
      branchId: query.branchId,
    });
  }

  @Get('departed-students/by-status')
  getDepartedStudentsByStatus(
    @Query() query: DepartedStudentsBranchQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getDepartedStudentsByStatus(companyId, {
      branchId: query.branchId,
    });
  }

  @Get('departed-students/reasons')
  getDepartedStudentsReasons(
    @Query() query: DepartedStudentsSummaryQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getDepartedStudentsReasons(companyId, {
      branchId: query.branchId,
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
  ) {
    return this.reportsService.getTeacherChangeReasons(companyId, {
      branchId: query.branchId,
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
  ) {
    return this.reportsService.getTransferReasons(companyId, {
      branchId: query.branchId,
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
  ) {
    return this.reportsService.getDepartedStudentsList(companyId, {
      branchId: query.branchId,
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
  ) {
    return this.reportsService.getDepartedStudentsByReason(companyId, {
      branchId: query.branchId,
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
  ) {
    return this.reportsService.getDepartedStudentsGroupBy(companyId, {
      branchId: query.branchId,
      groupBy: query.groupBy,
    });
  }

  @Get('departed-students/teacher-changes-list')
  getTeacherChangesList(
    @Query() query: DepartedStudentsSummaryQueryDto & { reasonId?: string },
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getTeacherChangesList(companyId, {
      branchId: query.branchId,
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
  ) {
    return this.reportsService.getTransferredList(companyId, {
      branchId: query.branchId,
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
  ) {
    return this.reportsService.getDepartedAfterTeacherChangeList(companyId, {
      branchId: query.branchId,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('student-payments/filter-options')
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  getStudentPaymentsFilterOptions(@CurrentUser('companyId') companyId: number) {
    return this.reportsService.getStudentPaymentsFilterOptions(companyId);
  }
}
