import { Module } from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { RefundsCreateService } from './refunds-create.service';
import { RefundsProcessService } from './refunds-process.service';
import { RefundsEligibilityService } from './refunds-eligibility.service';
import { RefundsController } from './refunds.controller';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [TransactionsModule],
  controllers: [RefundsController],
  providers: [
    RefundsService,
    RefundsCreateService,
    RefundsProcessService,
    RefundsEligibilityService,
  ],
  exports: [RefundsService],
})
export class RefundsModule {}
