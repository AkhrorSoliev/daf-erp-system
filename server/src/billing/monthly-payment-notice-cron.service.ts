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
 *
 * ADR-0064: the same run queues contract 3.7's reminder
 * (`payment.paidThroughReminderDays`, 0 = none) and hands the least share
 * (`payment.admissionMinPaidPercent`) to the bill and the 2nd-lesson
 * reminder. With contract 3.2 switched off (`payment.admissionRuleEnabled`)
 * nobody is kept out of a lesson, so there is neither.
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
        const admissionRule = await this.settingsService.get(
          company.id,
          'payment.admissionRuleEnabled',
        );
        const minPaidPercent = admissionRule
          ? await this.settingsService.get(
              company.id,
              'payment.admissionMinPaidPercent',
            )
          : 0;
        const days = admissionRule
          ? await this.settingsService.get(
              company.id,
              'payment.paidThroughReminderDays',
            )
          : 0;
        const bills = await this.notices.queueChargeNotices(
          company.id,
          now,
          enabled,
          minPaidPercent,
        );
        const reminders = enabled
          ? await this.notices.queueReminders(company.id, now, minPaidPercent)
          : 0;
        const paidThrough =
          enabled && days > 0
            ? await this.notices.queuePaidThroughReminders(
                company.id,
                now,
                days,
              )
            : 0;
        this.logger.log(
          `Company ${company.id}: ${bills} monthly bill(s), ${reminders} 2nd-lesson and ${paidThrough} paid-through reminder(s) queued` +
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
