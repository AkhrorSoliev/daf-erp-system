import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { TelegramDigestModule } from '../telegram-digest/telegram-digest.module';
import { SmsService } from './sms.service';
import { SmsEventsListener } from './sms-events.listener';

@Module({
  imports: [TelegramModule, TelegramDigestModule],
  providers: [SmsService, SmsEventsListener],
  exports: [SmsService],
})
export class SmsModule {}
