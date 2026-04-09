import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { SmsService } from './sms.service';
import { SmsEventsListener } from './sms-events.listener';

@Module({
  imports: [TelegramModule],
  providers: [SmsService, SmsEventsListener],
  exports: [SmsService],
})
export class SmsModule {}
