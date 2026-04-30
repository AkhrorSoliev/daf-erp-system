import { Module } from '@nestjs/common';
import { LessonBillingService } from './lesson-billing.service';
import { EnrollmentBillingService } from './enrollment-billing.service';
import { BillingController } from './billing.controller';
import { TransactionsModule } from '../transactions/transactions.module';
import { SalaryModule } from '../salary/salary.module';

/**
 * Owns the unified billing pipeline that both manual and QR attendance
 * delegate to, plus the enrollment-lifecycle prepaid refund helper used
 * when an enrollment is DROPPED or transferred.
 */
@Module({
  imports: [TransactionsModule, SalaryModule],
  controllers: [BillingController],
  providers: [LessonBillingService, EnrollmentBillingService],
  exports: [LessonBillingService, EnrollmentBillingService],
})
export class BillingModule {}
