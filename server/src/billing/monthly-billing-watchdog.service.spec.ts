import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MonthlyBillingWatchdogService } from './monthly-billing-watchdog.service';
import { MonthlyChargeService } from './monthly-charge.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MonthlyBillingWatchdogService', () => {
  let watchdog: MonthlyBillingWatchdogService;
  let prismaMock: any;
  let monthlyChargeMock: any;

  beforeEach(async () => {
    prismaMock = {
      company: { findMany: jest.fn().mockResolvedValue([{ id: 1 }]) },
    };
    monthlyChargeMock = {
      createChargesForPeriod: jest
        .fn()
        .mockResolvedValue({ created: 0, skipped: 0, totalCharged: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonthlyBillingWatchdogService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MonthlyChargeService, useValue: monthlyChargeMock },
      ],
    }).compile();

    watchdog = module.get(MonthlyBillingWatchdogService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('har kuni ishlaydi — faqat 1-kunga bog`liq emas', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-17T02:05:00+05:00'));
    await watchdog.healMissingCharges();
    expect(monthlyChargeMock.createChargesForPeriod).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 1,
        periodYear: 2026,
        periodMonth: 10,
      }),
    );
  });

  it('hech narsa topilmasa jim o`tadi — hech qanday xatolik yozilmaydi', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.useFakeTimers().setSystemTime(new Date('2026-10-17T02:05:00+05:00'));
    monthlyChargeMock.createChargesForPeriod.mockResolvedValueOnce({
      created: 0,
      skipped: 0,
      totalCharged: 0,
    });

    await watchdog.healMissingCharges();

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('bo`shliq topsa baland ovozda (error darajasida) jurnalga yozadi', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.useFakeTimers().setSystemTime(new Date('2026-10-17T02:05:00+05:00'));
    monthlyChargeMock.createChargesForPeriod.mockResolvedValueOnce({
      created: 3,
      skipped: 0,
      totalCharged: 1_350_000,
    });

    await watchdog.healMissingCharges();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('DIQQAT'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('3'));
    errorSpy.mockRestore();
  });

  it('bir kompaniya yiqilsa boshqasini to`xtatmaydi', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-17T02:05:00+05:00'));
    prismaMock.company.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    monthlyChargeMock.createChargesForPeriod
      .mockRejectedValueOnce(new Error('baza yiqildi'))
      .mockResolvedValueOnce({ created: 0, skipped: 0, totalCharged: 0 });

    await expect(watchdog.healMissingCharges()).resolves.toBeUndefined();
    expect(monthlyChargeMock.createChargesForPeriod).toHaveBeenCalledTimes(2);
  });
});
