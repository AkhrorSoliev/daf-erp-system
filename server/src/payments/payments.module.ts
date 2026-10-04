import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsWriteService } from './payments-write.service';
import { PaymentsReadService } from './payments-read.service';
import { PaymentsDebtorsService } from './payments-debtors.service';
import { PaymentsPreviewService } from './payments-preview.service';
import { PaymentsFrozenBalanceService } from './payments-frozen-balance.service';
import { PaymentsController } from './payments.controller';
import { PaymentEventsListener } from './payment-events.listener';
import { DebtListController } from './debt/debt-list.controller';
import { DebtListService } from './debt/debt-list.service';
import { TransactionsModule } from '../transactions/transactions.module';
import { BillingModule } from '../billing/billing.module';
import { SmsModule } from '../sms/sms.module';
import { MockExamsModule } from '../mock-exams/mock-exams.module';
import { PaymentPromisesModule } from '../payment-promises/payment-promises.module';
import { StatementsModule } from '../statements/statements.module';

@Module({
  imports: [
    TransactionsModule,
    BillingModule,
    SmsModule,
    MockExamsModule,
    PaymentPromisesModule,
    StatementsModule,
  ],
  controllers: [PaymentsController, DebtListController],
  providers: [
    PaymentsService,
    PaymentsWriteService,
    PaymentsReadService,
    PaymentsDebtorsService,
    PaymentsPreviewService,
    PaymentsFrozenBalanceService,
    PaymentEventsListener,
    DebtListService,
  ],
  exports: [PaymentsService, PaymentsDebtorsService],
})
export class PaymentsModule {}
