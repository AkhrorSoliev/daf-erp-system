import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { ChatAccessService } from './access/chat-access.service';
import { ChatController } from './chat.controller';

@Module({
  imports: [SettingsModule],
  controllers: [ChatController],
  providers: [ChatAccessService],
  exports: [ChatAccessService],
})
export class ChatModule {}
