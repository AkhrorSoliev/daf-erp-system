import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
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

@Module({
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportsOverviewService,
    ReportsAttendanceAnalyticsService,
    ReportsFinancialService,
    ReportsPaymentsService,
    ReportsTeacherPaymentsService,
    ReportsStudentPaymentsService,
    ReportsDepartedStudentsService,
    ReportsDepartedListsService,
    ReportsDepartedReasonsService,
    ReportsTeacherChangesService,
    ReportsCenterActivityService,
  ],
})
export class ReportsModule {}
