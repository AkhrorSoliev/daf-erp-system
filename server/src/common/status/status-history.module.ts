import { Global, Module } from '@nestjs/common';
import { StatusHistoryService } from './status-history.service';
import { StatusCascadeService } from './status-cascade.service';
import { BillingModule } from '../../billing/billing.module';

@Global()
@Module({
  // BillingModule provides EnrollmentBillingService — the cascade must
  // refund unused prepaid lessons before closing enrollments.
  imports: [BillingModule],
  providers: [StatusHistoryService, StatusCascadeService],
  exports: [StatusHistoryService, StatusCascadeService],
})
export class StatusHistoryModule {}
