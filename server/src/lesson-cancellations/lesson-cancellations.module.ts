import { Module } from '@nestjs/common';
import { LessonCancellationsController } from './lesson-cancellations.controller';
import { LessonCancellationsService } from './lesson-cancellations.service';
import { LessonCancellationEventsListener } from './lesson-cancellation-events.listener';
import { BillingModule } from '../billing/billing.module';
import { SmsModule } from '../sms/sms.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [BillingModule, SmsModule, NotificationsModule, TelegramModule],
  controllers: [LessonCancellationsController],
  providers: [LessonCancellationsService, LessonCancellationEventsListener],
  exports: [LessonCancellationsService],
})
export class LessonCancellationsModule {}
