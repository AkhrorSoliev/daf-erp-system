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

@Module({
  controllers: [TelegramGroupsController],
  providers: [
    TelegramGroupsService,
    TelegramGroupStatsService,
    TelegramGroupBroadcastService,
    TelegramGroupBroadcastListener,
    TelegramGroupDailyCronService,
    TelegramGroupAnnouncementService,
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
