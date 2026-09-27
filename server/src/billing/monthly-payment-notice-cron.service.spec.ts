import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { MonthlyPaymentNoticeCronService } from './monthly-payment-notice-cron.service';
import { MonthlyPaymentNoticeService } from './monthly-payment-notice.service';

describe('MonthlyPaymentNoticeCronService', () => {
  const NOW = new Date('2026-10-01T14:50:00Z');
  let cron: MonthlyPaymentNoticeCronService;
  let notices: { queueChargeNotices: jest.Mock; queueReminders: jest.Mock };
  let settingsGet: jest.Mock;

  beforeEach(async () => {
    notices = {
      queueChargeNotices: jest.fn().mockResolvedValue(0),
      queueReminders: jest.fn().mockResolvedValue(0),
    };
    settingsGet = jest.fn().mockResolvedValue(true);
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
    expect(notices.queueChargeNotices).toHaveBeenCalledWith(1, NOW, true);
    expect(notices.queueChargeNotices).toHaveBeenCalledWith(2, NOW, true);
    expect(notices.queueReminders).toHaveBeenCalledWith(1, NOW);
    expect(notices.queueReminders).toHaveBeenCalledWith(2, NOW);
  });

  it('with the notices off only marks the bills and sends no reminder', async () => {
    settingsGet.mockResolvedValue(false);
    await cron.run(NOW);
    expect(notices.queueChargeNotices).toHaveBeenCalledWith(1, NOW, false);
    expect(notices.queueReminders).not.toHaveBeenCalled();
  });

  it('one company failing does not stop the next', async () => {
    notices.queueChargeNotices.mockRejectedValueOnce(new Error('db down'));
    await cron.run(NOW);
    expect(notices.queueChargeNotices).toHaveBeenCalledWith(2, NOW, true);
    expect(notices.queueReminders).toHaveBeenCalledWith(2, NOW);
  });
});
