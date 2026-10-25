import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RedisService } from '../redis/redis.service';
import { SmsModule } from '../sms/sms.module';
import { SettingsModule } from '../settings/settings.module';
import { ChatAccessService } from './access/chat-access.service';
import { ChatEnabledGuard } from './chat-enabled.guard';
import { ChatAdminController } from './chat-admin.controller';
import { ChatController } from './chat.controller';
import {
  CHAT_RATE_LIMITER,
  ChatConversationsService,
  redisRateLimiter,
} from './conversations/chat-conversations.service';
import { ChatFileStorage } from './media/chat-file-storage';
import { ChatFileUploadInterceptor } from './media/chat-file-upload.interceptor';
import { ChatMediaPurgeService } from './media/chat-media-purge.service';
import { ChatMediaService } from './media/chat-media.service';
import { ChatNotifyService } from './notify/chat-notify.service';
import { ChatPeopleService } from './people/chat-people.service';
import { ChatBanService } from './reports/chat-ban.service';
import { ChatReportsService } from './reports/chat-reports.service';
import { ChatUsernameService } from './username/chat-username.service';

@Module({
  imports: [SettingsModule, NotificationsModule, SmsModule],
  controllers: [ChatController, ChatAdminController],
  providers: [
    ChatEnabledGuard,
    ChatAccessService,
    ChatPeopleService,
    ChatUsernameService,
    ChatConversationsService,
    ChatFileStorage,
    ChatFileUploadInterceptor,
    ChatMediaService,
    ChatMediaPurgeService,
    ChatNotifyService,
    ChatReportsService,
    ChatBanService,
    {
      provide: CHAT_RATE_LIMITER,
      useFactory: redisRateLimiter,
      inject: [RedisService],
    },
  ],
  exports: [ChatAccessService, ChatPeopleService, ChatConversationsService],
})
export class ChatModule {}
