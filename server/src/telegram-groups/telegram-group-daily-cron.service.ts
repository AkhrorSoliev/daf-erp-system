import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TelegramGroupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import { TelegramGroupStatsService } from './telegram-group-stats.service';
import { tashkentDayRange } from './utils/format.util';

/**
 * Runs daily at 09:00 Tashkent and sends each approved group its daily
 * report. Idempotent — guards via `TelegramGroup.lastDailyReportAt` so
 * a restart loop or manual re-run on the same day is safe.
 */
@Injectable()
export class TelegramGroupDailyCronService {
  private readonly logger = new Logger(TelegramGroupDailyCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly statsService: TelegramGroupStatsService,
    private readonly adminBot: TelegramAdminBotService,
  ) {}

  @Cron('0 9 * * *', { timeZone: 'Asia/Tashkent' })
  async sendDailyReports() {
    const bot = this.adminBot.getBot();
    if (!bot) {
      this.logger.warn(
        'Skipped daily report cron — admin bot not initialized',
      );
      return;
    }

    const today = tashkentDayRange();
    const groups = await this.prisma.telegramGroup.findMany({
      where: {
        status: TelegramGroupStatus.APPROVED,
        isActive: true,
        deletedAt: null,
        companyId: { not: null },
        OR: [
          { lastDailyReportAt: null },
          { lastDailyReportAt: { lt: today.start } },
        ],
      },
    });

    if (groups.length === 0) {
      this.logger.log('Daily report cron — no groups to notify');
      return;
    }

    let sent = 0;
    for (const g of groups) {
      if (!g.companyId) continue;
      try {
        const report = await this.statsService.buildDailyReport(g.companyId);
        await bot.telegram.sendMessage(g.chatId.toString(), report, {
          parse_mode: 'HTML',
        });
        await this.prisma.telegramGroup.update({
          where: { id: g.id },
          data: { lastDailyReportAt: new Date() },
        });
        sent += 1;
      } catch (err: any) {
        const code = err?.response?.error_code ?? err?.code;
        if (code === 403) {
          this.logger.warn(
            `Bot kicked from chat ${g.chatId} — marking inactive`,
          );
          await this.prisma.telegramGroup
            .update({ where: { id: g.id }, data: { isActive: false } })
            .catch(() => undefined);
        } else {
          this.logger.error(
            `Daily report send failed for chat ${g.chatId}: ${err?.message ?? err}`,
          );
        }
      }
    }

    this.logger.log(`Daily report sent to ${sent}/${groups.length} group(s)`);
  }
}
