import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TelegramGroupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import {
  DailySnapshotData,
  TelegramGroupDailyReportService,
} from './telegram-group-daily-report.service';
import { TelegramGroupReportMenuService } from './telegram-group-report-menu.service';
import { isTashkentSunday, tashkentDayRange } from './utils/format.util';
import { HolidaysService } from '../holidays/holidays.service';

/**
 * Runs daily at 21:00 Tashkent (end of workday) and sends each approved
 * group its daily report. Evening time captures the day's final numbers
 * for new students, payments, and lessons.
 *
 * Idempotent — guards via `TelegramGroup.lastDailyReportAt` so a restart
 * loop or manual re-run on the same day is safe.
 */
@Injectable()
export class TelegramGroupDailyCronService {
  private readonly logger = new Logger(TelegramGroupDailyCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dailyReport: TelegramGroupDailyReportService,
    private readonly adminBot: TelegramAdminBotService,
    private readonly holidaysService: HolidaysService,
  ) {}

  @Cron('0 21 * * *', { timeZone: 'Asia/Tashkent' })
  async sendDailyReports() {
    const bot = this.adminBot.getBot();
    if (!bot) {
      this.logger.warn(
        'Skipped daily report cron — admin bot not initialized',
      );
      return;
    }

    // Skip Sundays — weekly day off, no business activity.
    if (isTashkentSunday()) {
      this.logger.log('Skipped daily report cron — today is Sunday');
      return;
    }

    // Skip on holidays — no business activity, the report would be all
    // zeros and would spam groups with empty stats on Navro'z / Mustaqillik.
    const holiday = await this.holidaysService.findActiveHolidayCovering(
      new Date(),
    );
    if (holiday) {
      this.logger.log(
        `Skipped daily report cron — today is a holiday (${holiday.name})`,
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
    // A company can own several approved groups — build the (identical) report
    // once per company and reuse it for every group, so the prognoz walk and
    // salary sweep run once, not per chat.
    const builtByCompany = new Map<
      number,
      { message: string; snapshot: DailySnapshotData }
    >();
    for (const g of groups) {
      if (!g.companyId) continue;
      try {
        let built = builtByCompany.get(g.companyId);
        if (!built) {
          built = await this.dailyReport.build(g.companyId);
          builtByCompany.set(g.companyId, built);
        }
        await bot.telegram.sendMessage(g.chatId.toString(), built.message, {
          parse_mode: 'HTML',
          reply_markup: TelegramGroupReportMenuService.moreButton().reply_markup,
        });
        await this.prisma.telegramGroup.update({
          where: { id: g.id },
          data: { lastDailyReportAt: new Date() },
        });
        // Persist tonight's baseline for tomorrow's ▲/▼ delta only after a
        // confirmed send (idempotent upsert — safe to repeat per group).
        await this.dailyReport.persistSnapshot(g.companyId, built.snapshot);
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
