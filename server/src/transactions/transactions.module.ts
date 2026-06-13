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
  exports: [TransactionsService],
})
export class TransactionsModule {}
