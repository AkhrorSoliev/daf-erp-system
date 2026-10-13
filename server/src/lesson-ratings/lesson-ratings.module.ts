import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { SettingsModule } from '../settings/settings.module';
import { LessonRatingSenderService } from './lesson-rating-sender.service';

/** Dars baholari (spec 2026-10-13). TelegramModule'ga bir tomonlama bog'liq. */
@Module({
  imports: [TelegramModule, HolidaysModule, SettingsModule],
  providers: [LessonRatingSenderService],
})
export class LessonRatingsModule {}
