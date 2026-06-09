import { Module } from '@nestjs/common';
import { PaymentPromisesService } from './payment-promises.service';
import { PaymentPromisesController } from './payment-promises.controller';
import { PaymentPromiseCronService } from './payment-promise-cron.service';
import { HolidaysModule } from '../holidays/holidays.module';

@Module({
  // HolidaysModule exports HolidaysService (cron skips active holidays).
  // PrismaModule, EntityHistoryModule, ScheduleModule and the event bus are
  // global.
  imports: [HolidaysModule],
  controllers: [PaymentPromisesController],
  providers: [PaymentPromisesService, PaymentPromiseCronService],
  exports: [PaymentPromisesService],
})
export class PaymentPromisesModule {}
