import { Global, Module } from '@nestjs/common';
import { StatusHistoryService } from './status-history.service';
import { StatusCascadeService } from './status-cascade.service';
import { BillingModule } from '../../billing/billing.module';

@Global()
@Module({
  // BillingModule provides EnrollmentBillingService (LESSON_PACK prepaid
  // refund) and MonthlyChargeService (MONTHLY departure refund) — the
  // cascade must refund unused money before closing enrollments, whichever
  // billing model the student's course uses.
  imports: [BillingModule],
  providers: [StatusHistoryService, StatusCascadeService],
  exports: [StatusHistoryService, StatusCascadeService],
})
export class StatusHistoryModule {}
