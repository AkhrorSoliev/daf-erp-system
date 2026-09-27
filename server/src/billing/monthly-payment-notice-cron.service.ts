import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { MonthlyPaymentNoticeService } from './monthly-payment-notice.service';

/**
 * Queues the monthly bill and the 2nd-lesson reminder (ADR-0042) at 19:50,
 * ten minutes before the personal digest (20:00) sends the queue. Runs every
 * day, Sundays and holidays included: the reminder belongs to the evening
 * before the lesson whatever day that is. `payment.monthlyNoticesEnabled`
 * (company-level) switches the messages off; the bills are still marked, so
 * switching back on sends no old bill.
 */
@Injectable()
export class MonthlyPaymentNoticeCronService {
  private readonly logger = new Logger(MonthlyPaymentNoticeCronService.name);

  constructor(
    private prisma: PrismaService,
    private notices: MonthlyPaymentNoticeService,
    private settingsService: SettingsService,
  ) {}

  @Cron('50 19 * * *', { timeZone: 'Asia/Tashkent' })
  async run(now: Date = new Date()): Promise<void> {
    const companies = await this.prisma.company.findMany({
      select: { id: true },
    });
    for (const company of companies) {
      try {
        const enabled = await this.settingsService.get(
          company.id,
          'payment.monthlyNoticesEnabled',
        );
        const bills = await this.notices.queueChargeNotices(
          company.id,
          now,
          enabled,
        );
        const reminders = enabled
          ? await this.notices.queueReminders(company.id, now)
          : 0;
        this.logger.log(
          `Company ${company.id}: ${bills} monthly bill(s), ${reminders} payment reminder(s) queued` +
            (enabled ? '' : ' — notices are switched off'),
        );
      } catch (error) {
        this.logger.error(
          `Company ${company.id}: monthly payment notices failed`,
          error,
        );
      }
    }
  }
}
