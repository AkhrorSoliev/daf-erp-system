import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsOverviewService } from './reports-overview.service';
import { ReportsAttendanceAnalyticsService } from './reports-attendance-analytics.service';
import { ReportsFinancialService } from './reports-financial.service';
import { ReportsDebtHistoryService } from './reports-debt-history.service';
import { ReportsPaymentsService } from './reports-payments.service';
import { ReportsTeacherPaymentsService } from './reports-teacher-payments.service';
import { ReportsStudentPaymentsService } from './reports-student-payments.service';
import { ReportsDepartedStudentsService } from './reports-departed-students.service';
import { ReportsDepartedListsService } from './reports-departed-lists.service';
import { ReportsDepartedReasonsService } from './reports-departed-reasons.service';
import { ReportsTeacherChangesService } from './reports-teacher-changes.service';
import { ReportsCenterActivityService } from './reports-center-activity.service';
import { ReportsProfitLossService } from './reports-profit-loss.service';
import { ReportsCashFlowService } from './reports-cash-flow.service';
import { ReportsBalanceSheetService } from './reports-balance-sheet.service';
import { ReportsExcelService } from './reports-excel.service';
import { ReportsExpectationService } from './reports-expectation.service';
import { ReportsExpectationHistoryService } from './reports-expectation-history.service';
import { ReportsStudentFlowService } from './reports-student-flow.service';
import { HolidaysModule } from '../holidays/holidays.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { SalaryModule } from '../salary/salary.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [HolidaysModule, ExpensesModule, SalaryModule, PaymentsModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportsOverviewService,
    ReportsAttendanceAnalyticsService,
    ReportsFinancialService,
    ReportsDebtHistoryService,
    ReportsPaymentsService,
    ReportsTeacherPaymentsService,
    ReportsStudentPaymentsService,
    ReportsDepartedStudentsService,
    ReportsDepartedListsService,
    ReportsDepartedReasonsService,
    ReportsTeacherChangesService,
    ReportsCenterActivityService,
    ReportsProfitLossService,
    ReportsCashFlowService,
    ReportsBalanceSheetService,
    ReportsExcelService,
    ReportsExpectationService,
    ReportsExpectationHistoryService,
    ReportsStudentFlowService,
  ],
  // Exposed so the Telegram admin bot's report menu can generate the same
  // financial Excel workbook + in-chat summary the /payments panel uses.
  // ReportsService is exported so the Telegram surfaces can read the ONE
  // canonical net-profit figure (`getMonthlyNetProfit`) instead of each
  // re-deriving its own.
  exports: [
    ReportsExcelService,
    ReportsFinancialService,
    ReportsDebtHistoryService,
    ReportsService,
    ReportsExpectationService,
    ReportsExpectationHistoryService,
    ReportsStudentFlowService,
  ],
})
export class ReportsModule {}
