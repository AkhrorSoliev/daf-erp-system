import { Injectable } from '@nestjs/common';
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
  ) {}

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
  getTeacherPerformance(companyId: number, query: ReportsQueryDto) {
    return this.attendanceAnalytics.getTeacherPerformance(companyId, query);
  }
  getAttendanceAnalytics(companyId: number, query: ReportsQueryDto) {
    return this.attendanceAnalytics.getAttendanceAnalytics(companyId, query);
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
    params: {
      branchId?: number;
      courseId?: string;
      teacherIds?: number[];
      startDate: string;
      endDate: string;
    },
  ) {
    return this.departedStudents.getDepartedStudentsSummary(companyId, params);
  }
  getDepartedStudentsDynamics(
    companyId: number,
    params: {
      branchId?: number;
      courseId?: string;
      teacherIds?: number[];
      startDate: string;
      endDate: string;
    },
  ) {
    return this.departedStudents.getDepartedStudentsDynamics(companyId, params);
  }
  getDepartedStudentsList(
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
    return this.departedLists.getDepartedStudentsList(companyId, params);
  }
  getDepartedStudentsGroupBy(
    companyId: number,
    params: {
      branchId?: number;
      courseId?: string;
      teacherIds?: number[];
      startDate: string;
      endDate: string;
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
    params: {
      branchId?: number;
      courseId?: string;
      teacherIds?: number[];
      startDate: string;
      endDate: string;
    },
  ) {
    return this.teacherChanges.getDepartedAfterTeacherChangeList(
      companyId,
      params,
    );
  }
}
