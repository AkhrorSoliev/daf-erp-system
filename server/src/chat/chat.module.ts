import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RedisService } from '../redis/redis.service';
import { SettingsModule } from '../settings/settings.module';
import { ChatAccessService } from './access/chat-access.service';
import { ChatController } from './chat.controller';
import {
  CHAT_RATE_LIMITER,
  ChatConversationsService,
  redisRateLimiter,
} from './conversations/chat-conversations.service';
import { ChatPeopleService } from './people/chat-people.service';
import { ChatUsernameService } from './username/chat-username.service';

@Module({
  imports: [SettingsModule, NotificationsModule],
  controllers: [ChatController],
  providers: [
    ChatAccessService,
    ChatPeopleService,
    ChatUsernameService,
    ChatConversationsService,
    {
      provide: CHAT_RATE_LIMITER,
      useFactory: redisRateLimiter,
      inject: [RedisService],
    },
  ],
  exports: [ChatAccessService, ChatPeopleService, ChatConversationsService],
})
export class ChatModule {}
