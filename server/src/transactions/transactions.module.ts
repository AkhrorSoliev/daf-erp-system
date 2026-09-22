import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsWriteService } from './transactions-write.service';
import { TransactionsReadService } from './transactions-read.service';
import { TransactionsController } from './transactions.controller';
import { CashAccountsModule } from '../cash-accounts/cash-accounts.module';

@Module({
  imports: [CashAccountsModule],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    TransactionsWriteService,
    TransactionsReadService,
  ],
  // `TransactionsWriteService` exported alongside `TransactionsService`:
  // `MonthlyChargeService` (billing module) calls `chargeMonthlyFee`/
  // `reverseMonthlyFee` directly, so it needs this provider visible outside
  // this module too.
  exports: [TransactionsService, TransactionsWriteService],
})
export class TransactionsModule {}
