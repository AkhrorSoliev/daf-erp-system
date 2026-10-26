import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { TelegramDigestModule } from '../telegram-digest/telegram-digest.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationEventsListener } from './notification-events.listener';
import { NotificationResolverService } from './notification-resolver.service';
import { PushService } from './push.service';
import { LeadOwnerNotifyListener } from './lead-owner-notify.listener';

@Module({
  imports: [TelegramModule, TelegramDigestModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationEventsListener,
    LeadOwnerNotifyListener,
    NotificationResolverService,
    PushService,
  ],
  exports: [
    NotificationsService,
    NotificationsGateway,
    PushService,
    NotificationResolverService,
  ],
})
export class NotificationsModule {}
