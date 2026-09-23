import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsWriteService } from './payments-write.service';
import { PaymentsReadService } from './payments-read.service';
import { PaymentsDebtorsService } from './payments-debtors.service';
import { PaymentsPreviewService } from './payments-preview.service';
import { PaymentsFrozenBalanceService } from './payments-frozen-balance.service';
import { PaymentsController } from './payments.controller';
import { PaymentEventsListener } from './payment-events.listener';
import { TransactionsModule } from '../transactions/transactions.module';
import { BillingModule } from '../billing/billing.module';
import { TelegramDigestModule } from '../telegram-digest/telegram-digest.module';
import { MockExamsModule } from '../mock-exams/mock-exams.module';

@Module({
  imports: [
    TransactionsModule,
    BillingModule,
    TelegramDigestModule,
    MockExamsModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsWriteService,
    PaymentsReadService,
    PaymentsDebtorsService,
    PaymentsPreviewService,
    PaymentsFrozenBalanceService,
    PaymentEventsListener,
  ],
  exports: [PaymentsService, PaymentsDebtorsService],
})
export class PaymentsModule {}
