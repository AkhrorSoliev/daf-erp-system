import { Module } from '@nestjs/common';
import { TelegramGroupsController } from './telegram-groups.controller';
import { TelegramGroupsService } from './telegram-groups.service';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import { TelegramAdminBotRegistrar } from './telegram-admin-bot-registrar';
import { TelegramGroupStatsService } from './telegram-group-stats.service';
import { TelegramGroupBroadcastService } from './telegram-group-broadcast.service';
import { TelegramGroupBroadcastListener } from './telegram-group-broadcast.listener';
import { TelegramGroupDailyCronService } from './telegram-group-daily-cron.service';
import { TelegramGroupAnnouncementService } from './telegram-group-announcement.service';
import { TelegramGroupDigestBufferService } from './telegram-group-digest-buffer.service';
import { TelegramGroupDigestService } from './telegram-group-digest.service';
import { TelegramGroupDigestCronService } from './telegram-group-digest-cron.service';
import { HolidaysModule } from '../holidays/holidays.module';

@Module({
  imports: [HolidaysModule],
  controllers: [TelegramGroupsController],
  providers: [
    TelegramGroupsService,
    TelegramGroupStatsService,
    TelegramGroupBroadcastService,
    TelegramGroupBroadcastListener,
    TelegramGroupDailyCronService,
    TelegramGroupAnnouncementService,
    TelegramGroupDigestBufferService,
    TelegramGroupDigestService,
    TelegramGroupDigestCronService,
    TelegramAdminBotRegistrar,
    TelegramAdminBotService,
  ],
  exports: [
    TelegramGroupsService,
    TelegramGroupStatsService,
    TelegramGroupBroadcastService,
    TelegramGroupAnnouncementService,
    TelegramAdminBotService,
  ],
})
export class TelegramGroupsModule {}
