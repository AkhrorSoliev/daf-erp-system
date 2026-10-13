import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { SettingsModule } from '../settings/settings.module';
import { LessonRatingSenderService } from './lesson-rating-sender.service';
import { LessonRatingTelegramHandler } from './lesson-rating-telegram.handler';
import { LessonRatingsController } from './lesson-ratings.controller';
import { LessonRatingsService } from './lesson-ratings.service';

/** Dars baholari (spec 2026-10-13). TelegramModule'ga bir tomonlama bog'liq. */
@Module({
  imports: [TelegramModule, HolidaysModule, SettingsModule],
  controllers: [LessonRatingsController],
  providers: [
    LessonRatingSenderService,
    LessonRatingTelegramHandler,
    LessonRatingsService,
  ],
})
export class LessonRatingsModule {}
