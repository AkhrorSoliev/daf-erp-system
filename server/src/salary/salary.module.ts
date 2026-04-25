import { Module } from '@nestjs/common';
import { SalaryService } from './salary.service';
import { SalaryConfigService } from './salary-config.service';
import { SalaryAccrualService } from './salary-accrual.service';
import { SalarySummaryService } from './salary-summary.service';
import { SalaryCalculationService } from './salary-calculation.service';
import { SalaryPaymentService } from './salary-payment.service';
import { SalaryController } from './salary.controller';
import { SalaryCronService } from './salary-cron.service';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [TransactionsModule],
  controllers: [SalaryController],
  providers: [
    SalaryService,
    SalaryConfigService,
    SalaryAccrualService,
    SalarySummaryService,
    SalaryCalculationService,
    SalaryPaymentService,
    SalaryCronService,
  ],
  exports: [SalaryService],
})
export class SalaryModule {}
