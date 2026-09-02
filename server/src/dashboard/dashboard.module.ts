import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardSummaryService } from './dashboard-summary.service';
import { HolidaysModule } from '../holidays/holidays.module';
import { ReportsModule } from '../reports/reports.module';
import { PaymentsModule } from '../payments/payments.module';
import { OutreachModule } from '../outreach/outreach.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  // Bosh sahifaning paneli mavjud servislarni QAYTA CHAQIRADI — o'zi hisob
  // yozmaydi, shuning uchun bu to'rt modul import qilinadi.
  imports: [
    HolidaysModule,
    ReportsModule,
    PaymentsModule,
    OutreachModule,
    RedisModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardSummaryService],
})
export class DashboardModule {}
