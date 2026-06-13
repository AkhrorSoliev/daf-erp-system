import { Injectable } from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { ReportsQueryDto } from './dto/reports-query.dto';
import { ReportsOverviewService } from './reports-overview.service';
import { ReportsAttendanceAnalyticsService } from './reports-attendance-analytics.service';
import { ReportsFinancialService } from './reports-financial.service';
import { ReportsPaymentsService } from './reports-payments.service';
import { ReportsTeacherPaymentsService } from './reports-teacher-payments.service';
import { ReportsStudentPaymentsService } from './reports-student-payments.service';
import { ReportsDepartedStudentsService } from './reports-departed-students.service';
import { ReportsDepartedListsService } from './reports-departed-lists.service';
import { ReportsDepartedReasonsService } from './reports-departed-reasons.service';
import { ReportsTeacherChangesService } from './reports-teacher-changes.service';
import { ReportsCenterActivityService } from './reports-center-activity.service';
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

@Injectable()
export class ReportsService {
  constructor(
    private overview: ReportsOverviewService,
    private attendanceAnalytics: ReportsAttendanceAnalyticsService,
    private financial: ReportsFinancialService,
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
  ) {}

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
  getFinancialOverview(
    companyId: number,
    query: { branchId?: number; startDate?: string; endDate?: string },
  ) {
    return this.financial.getFinancialOverview(companyId, query);
  }
  getFinancialTrend(companyId: number, branchId?: number) {
    return this.financial.getFinancialTrend(companyId, branchId);
  }
  getDebtWriteOffsSummary(
    companyId: number,
    options?: Parameters<
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
  getStudentPaymentsFilterOptions(companyId: number) {
    return this.studentPayments.getStudentPaymentsFilterOptions(companyId);
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
