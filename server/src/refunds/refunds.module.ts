import { Module } from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { RefundsCreateService } from './refunds-create.service';
import { RefundsProcessService } from './refunds-process.service';
import { RefundsEligibilityService } from './refunds-eligibility.service';
import { RefundsController } from './refunds.controller';
import { RefundStudentMessagesListener } from './refund-student-messages.listener';
import { TransactionsModule } from '../transactions/transactions.module';
import { BillingModule } from '../billing/billing.module';
import { CashAccountsModule } from '../cash-accounts/cash-accounts.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [TransactionsModule, BillingModule, CashAccountsModule, SmsModule],
  controllers: [RefundsController],
  providers: [
    RefundsService,
    RefundsCreateService,
    RefundsProcessService,
    RefundsEligibilityService,
    RefundStudentMessagesListener,
  ],
  exports: [RefundsService],
})
export class RefundsModule {}
