import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesMonthService } from './expenses-month.service';
import { ExpensesController } from './expenses.controller';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [TransactionsModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, ExpensesMonthService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
