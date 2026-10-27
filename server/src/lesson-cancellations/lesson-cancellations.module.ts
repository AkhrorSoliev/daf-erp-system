import { Module } from '@nestjs/common';
import { LessonCancellationsController } from './lesson-cancellations.controller';
import { LessonCancellationsService } from './lesson-cancellations.service';
import { LessonCancellationEventsListener } from './lesson-cancellation-events.listener';
import { BillingModule } from '../billing/billing.module';
import { SmsModule } from '../sms/sms.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramModule } from '../telegram/telegram.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { GroupPauseLessonsService } from './group-pause-lessons.service';
import { LessonReschedulesModule } from '../lesson-reschedules/lesson-reschedules.module';

@Module({
  imports: [
    BillingModule,
    LessonReschedulesModule,
    SmsModule,
    NotificationsModule,
    TelegramModule,
    HolidaysModule,
  ],
  controllers: [LessonCancellationsController],
  providers: [
    LessonCancellationsService,
    LessonCancellationEventsListener,
    GroupPauseLessonsService,
  ],
  exports: [LessonCancellationsService],
})
export class LessonCancellationsModule {}
