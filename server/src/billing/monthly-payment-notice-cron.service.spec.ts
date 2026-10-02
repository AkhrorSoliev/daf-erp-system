import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { MonthlyPaymentNoticeCronService } from './monthly-payment-notice-cron.service';
import { MonthlyPaymentNoticeService } from './monthly-payment-notice.service';

describe('MonthlyPaymentNoticeCronService', () => {
  const NOW = new Date('2026-10-01T14:50:00Z');
  let cron: MonthlyPaymentNoticeCronService;
  let notices: {
    queueChargeNotices: jest.Mock;
    queueReminders: jest.Mock;
    queuePaidThroughReminders: jest.Mock;
  };
  let settingsGet: jest.Mock;
  /** The settings as shipped; a test overrides single keys. */
  let settings: Record<string, unknown>;

  beforeEach(async () => {
    notices = {
      queueChargeNotices: jest.fn().mockResolvedValue(0),
      queueReminders: jest.fn().mockResolvedValue(0),
      queuePaidThroughReminders: jest.fn().mockResolvedValue(0),
    };
    settings = {
      'payment.monthlyNoticesEnabled': true,
      'payment.admissionRuleEnabled': true,
      'payment.admissionMinPaidPercent': 50,
      'payment.paidThroughReminderDays': 3,
    };
    settingsGet = jest.fn((_companyId: number, key: string) =>
      Promise.resolve(settings[key]),
    );
    const module = await Test.createTestingModule({
      providers: [
        MonthlyPaymentNoticeCronService,
        {
          provide: PrismaService,
          useValue: {
            company: {
              findMany: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
            },
          },
        },
        { provide: MonthlyPaymentNoticeService, useValue: notices },
        { provide: SettingsService, useValue: { get: settingsGet } },
      ],
    }).compile();
    cron = module.get(MonthlyPaymentNoticeCronService);
  });

  it('runs at 19:50 Tashkent — before the 20:00 digest drains the queue', () => {
    expect(
      Reflect.getMetadata(
        'SCHEDULE_CRON_OPTIONS',
        MonthlyPaymentNoticeCronService.prototype.run,
      ),
    ).toEqual(
      expect.objectContaining({
        cronTime: '50 19 * * *',
        timeZone: 'Asia/Tashkent',
      }),
    );
  });

  it('queues bills and reminders for every company with the notices on', async () => {
    await cron.run(NOW);
    expect(settingsGet).toHaveBeenCalledWith(
      1,
      'payment.monthlyNoticesEnabled',
    );
    expect(notices.queueChargeNotices).toHaveBeenCalledWith(1, NOW, true, 50);
    expect(notices.queueChargeNotices).toHaveBeenCalledWith(2, NOW, true, 50);
    expect(notices.queueReminders).toHaveBeenCalledWith(1, NOW, 50);
    expect(notices.queueReminders).toHaveBeenCalledWith(2, NOW, 50);
    expect(notices.queuePaidThroughReminders).toHaveBeenCalledWith(1, NOW, 3);
    expect(notices.queuePaidThroughReminders).toHaveBeenCalledWith(2, NOW, 3);
  });

  it('with the notices off only marks the bills and sends no reminder', async () => {
    settings['payment.monthlyNoticesEnabled'] = false;
    await cron.run(NOW);
    expect(notices.queueChargeNotices).toHaveBeenCalledWith(1, NOW, false, 50);
    expect(notices.queueReminders).not.toHaveBeenCalled();
    expect(notices.queuePaidThroughReminders).not.toHaveBeenCalled();
  });

  it('with contract 3.2 switched off there is no least share and no 3.7 reminder', async () => {
    settings['payment.admissionRuleEnabled'] = false;
    await cron.run(NOW);
    expect(notices.queueChargeNotices).toHaveBeenCalledWith(1, NOW, true, 0);
    expect(notices.queueReminders).toHaveBeenCalledWith(1, NOW, 0);
    expect(notices.queuePaidThroughReminders).not.toHaveBeenCalled();
  });

  it('0 days switches the 3.7 reminder off alone', async () => {
    settings['payment.paidThroughReminderDays'] = 0;
    await cron.run(NOW);
    expect(notices.queueReminders).toHaveBeenCalledWith(1, NOW, 50);
    expect(notices.queuePaidThroughReminders).not.toHaveBeenCalled();
  });

  it('one company failing does not stop the next', async () => {
    notices.queueChargeNotices.mockRejectedValueOnce(new Error('db down'));
    await cron.run(NOW);
    expect(notices.queueChargeNotices).toHaveBeenCalledWith(2, NOW, true, 50);
    expect(notices.queueReminders).toHaveBeenCalledWith(2, NOW, 50);
  });
});
