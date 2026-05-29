import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsWriteService } from './payments-write.service';
import { PaymentsReadService } from './payments-read.service';
import { PaymentsDebtorsService } from './payments-debtors.service';
import { PaymentsPreviewService } from './payments-preview.service';
import { PaymentsController } from './payments.controller';
import { PaymentEventsListener } from './payment-events.listener';
import { TransactionsModule } from '../transactions/transactions.module';
import { BillingModule } from '../billing/billing.module';
import { SmsModule } from '../sms/sms.module';
import { MockExamsModule } from '../mock-exams/mock-exams.module';

@Module({
  imports: [TransactionsModule, BillingModule, SmsModule, MockExamsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsWriteService,
    PaymentsReadService,
    PaymentsDebtorsService,
    PaymentsPreviewService,
    PaymentEventsListener,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
