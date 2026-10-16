import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { isTashkentSunday } from '../telegram-groups/utils/format.util';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { describeError } from '../telegram-digest/telegram-send';
import {
  PersonalReportService,
  type DeliverResult,
  type ReportCache,
} from './personal-report.service';
import { tashkentClock } from './report-clock';

/** A failure the next half-hour can fix gives today's claim back. */
const retryable = (r: DeliverResult) =>
  !r.ok &&
  (r.reason === 'NO_BOT' ||
    (r.reason === 'SEND_FAILED' && r.kind === 'transient'));

/**
 * Sends each personal report once a day at its own time (ADR-0095). Mon–Sat,
 * not on a company-wide holiday. A recipient whose time has passed and who has
 * not had today's report is sent at the next half-hour, so a restart or a
 * transient Telegram error only delays it.
 */
@Injectable()
export class PersonalReportCron {
  private readonly logger = new Logger(PersonalReportCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly holidays: HolidaysService,
    private readonly reports: PersonalReportService,
  ) {}

  @Cron('0 0,30 7-23 * * 1-6', { timeZone: 'Asia/Tashkent' })
  async tick(): Promise<void> {
    try {
      await this.run();
    } catch (err) {
      this.logger.error(`personal report run failed: ${describeError(err)}`);
    }
  }

  async run(now = new Date()): Promise<number> {
    if (isTashkentSunday(now)) return 0;
    // Holidays are stored as UTC-midnight dates (date <= X <= endDate), so ask
    // for the Tashkent day, not the instant: 07:00 Tashkent is 02:00Z, which
    // would miss a holiday's last day.
    const today = utcMidnightFromDateStr(tashkentDateStr(now));
    if (await this.holidays.findActiveHolidayCovering(today, null)) return 0;
    const notToday = [{ lastSentDate: null }, { lastSentDate: { lt: today } }];
    const due = await this.prisma.telegramReportRecipient.findMany({
      where: {
        isActive: true,
        sendTime: { lte: tashkentClock(now).time },
        OR: notToday,
      },
    });
    const cache: ReportCache = new Map();
    let sent = 0;
    for (const r of due) {
      // One recipient's failure (a DB error included) never stops the rest.
      try {
        const claim = await this.prisma.telegramReportRecipient.updateMany({
          where: { id: r.id, OR: notToday },
          data: { lastSentDate: today },
        });
        if (claim.count === 0) continue;
        let result: DeliverResult;
        try {
          result = await this.reports.deliver(r, cache, now);
        } catch (err) {
          await this.giveBack(r, today); // a throw stays retryable
          throw err; // logged once below
        }
        if (result.ok) {
          sent += 1;
          continue;
        }
        if (retryable(result)) await this.giveBack(r, today);
        this.logger.warn(`personal report ${r.id} not sent: ${result.reason}`);
      } catch (err) {
        this.logger.error(
          `personal report ${r.id} failed: ${describeError(err)}`,
        );
      }
    }
    return sent;
  }

  private async giveBack(
    r: { id: number; lastSentDate: Date | null },
    today: Date,
  ): Promise<void> {
    await this.prisma.telegramReportRecipient.updateMany({
      where: { id: r.id, lastSentDate: today },
      data: { lastSentDate: r.lastSentDate },
    });
  }
}
