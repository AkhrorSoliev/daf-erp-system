import { Module } from '@nestjs/common';
import { SalaryService } from './salary.service';
import { SalaryController } from './salary.controller';
import { SalaryCronService } from './salary-cron.service';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [TransactionsModule],
  controllers: [SalaryController],
  providers: [SalaryService, SalaryCronService],
  exports: [SalaryService],
})
export class SalaryModule {}
