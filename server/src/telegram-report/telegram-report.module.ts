import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { TelegramGroupsModule } from '../telegram-groups/telegram-groups.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { PersonalReportService } from './personal-report.service';
import { PersonalReportCron } from './personal-report.cron';
import { TelegramReportRecipientsService } from './telegram-report-recipients.service';
import { TelegramReportController } from './telegram-report.controller';
import { PersonalReportTelegramHandler } from './personal-report-telegram.handler';

/** Personal Telegram report (ADR-0095). Depends on TelegramModule one way. */
@Module({
  imports: [TelegramModule, TelegramGroupsModule, HolidaysModule],
  controllers: [TelegramReportController],
  providers: [
    PersonalReportService,
    PersonalReportCron,
    TelegramReportRecipientsService,
    PersonalReportTelegramHandler,
  ],
})
export class TelegramReportModule {}
