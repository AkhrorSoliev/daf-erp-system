import { Module } from '@nestjs/common';
import { LessonReschedulesController } from './lesson-reschedules.controller';
import { LessonReschedulesService } from './lesson-reschedules.service';
import { LessonRescheduleEventsListener } from './lesson-reschedule-events.listener';
import { BillingModule } from '../billing/billing.module';
import { SmsModule } from '../sms/sms.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [BillingModule, SmsModule, NotificationsModule, TelegramModule],
  controllers: [LessonReschedulesController],
  providers: [LessonReschedulesService, LessonRescheduleEventsListener],
  exports: [LessonReschedulesService],
})
export class LessonReschedulesModule {}
