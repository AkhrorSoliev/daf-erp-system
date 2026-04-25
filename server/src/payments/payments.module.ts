import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsWriteService } from './payments-write.service';
import { PaymentsReadService } from './payments-read.service';
import { PaymentsDebtorsService } from './payments-debtors.service';
import { PaymentsController } from './payments.controller';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [TransactionsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsWriteService,
    PaymentsReadService,
    PaymentsDebtorsService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
