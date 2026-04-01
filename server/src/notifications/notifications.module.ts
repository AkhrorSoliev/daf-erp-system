import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationEventsListener } from './notification-events.listener';
import { PushService } from './push.service';

@Module({
  imports: [TelegramModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationEventsListener,
    PushService,
  ],
  exports: [NotificationsService, NotificationsGateway, PushService],
})
export class NotificationsModule {}
