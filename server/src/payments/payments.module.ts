import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsWriteService } from './payments-write.service';
import { PaymentsReadService } from './payments-read.service';
import { PaymentsDebtorsService } from './payments-debtors.service';
import { PaymentsController } from './payments.controller';
import { PaymentEventsListener } from './payment-events.listener';
import { TransactionsModule } from '../transactions/transactions.module';
import { BillingModule } from '../billing/billing.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [TransactionsModule, BillingModule, SmsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsWriteService,
    PaymentsReadService,
    PaymentsDebtorsService,
    PaymentEventsListener,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
