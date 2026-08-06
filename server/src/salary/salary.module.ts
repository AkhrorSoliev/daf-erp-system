import { Module } from '@nestjs/common';
import { SalaryService } from './salary.service';
import { SalaryConfigService } from './salary-config.service';
import { SalaryAccrualService } from './salary-accrual.service';
import { SalarySummaryService } from './salary-summary.service';
import { SalaryOverviewService } from './salary-overview.service';
import { SalaryMonthlyService } from './salary-monthly.service';
import { SalaryStaffMonthlyService } from './salary-monthly-staff.service';
import { SalaryCalculationService } from './salary-calculation.service';
import { SalaryPaymentService } from './salary-payment.service';
import { SalarySettleMonthService } from './salary-settle-month.service';
import { SalaryController } from './salary.controller';
import { SalaryCronService } from './salary-cron.service';
import { TeacherTimelineService } from './teacher-timeline.service';
import { SalaryBreakdownService } from './salary-breakdown.service';
import { SalaryAdvanceCalendarService } from './salary-advance-calendar.service';
import { SalaryPeriodSettingsService } from './salary-period-settings.service';
import { SalaryUserLifecycleListener } from './salary-user-lifecycle.listener';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [TransactionsModule],
  controllers: [SalaryController],
  providers: [
    SalaryService,
    SalaryConfigService,
    SalaryAccrualService,
    SalarySummaryService,
    SalaryOverviewService,
    SalaryMonthlyService,
    SalaryStaffMonthlyService,
    SalaryCalculationService,
    SalaryPaymentService,
    SalarySettleMonthService,
    SalaryCronService,
    TeacherTimelineService,
    SalaryBreakdownService,
    SalaryAdvanceCalendarService,
    SalaryPeriodSettingsService,
    SalaryUserLifecycleListener,
  ],
  exports: [
    SalaryService,
    SalaryAccrualService,
    TeacherTimelineService,
    SalaryBreakdownService,
    SalaryPaymentService,
    SalaryMonthlyService,
  ],
})
export class SalaryModule {}
