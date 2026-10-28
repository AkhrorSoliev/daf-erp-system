import { Module } from '@nestjs/common';
import { ExpensesModule } from '../expenses/expenses.module';
import { ReportsModule } from '../reports/reports.module';
import { MonthCloseController } from './month-close.controller';
import { MonthCloseService } from './month-close.service';

@Module({
  imports: [ExpensesModule, ReportsModule],
  controllers: [MonthCloseController],
  providers: [MonthCloseService],
})
export class MonthCloseModule {}
