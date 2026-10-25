import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { ChatAccessService } from './access/chat-access.service';
import { ChatController } from './chat.controller';
import { ChatUsernameService } from './username/chat-username.service';

@Module({
  imports: [SettingsModule],
  controllers: [ChatController],
  providers: [ChatAccessService, ChatUsernameService],
  exports: [ChatAccessService],
})
export class ChatModule {}
