import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsWriteService } from './transactions-write.service';
import { TransactionsReadService } from './transactions-read.service';
import { TransactionsController } from './transactions.controller';

@Module({
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    TransactionsWriteService,
    TransactionsReadService,
  ],
  exports: [TransactionsService],
})
export class TransactionsModule {}
