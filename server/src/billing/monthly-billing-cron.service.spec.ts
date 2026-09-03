import { Test, TestingModule } from '@nestjs/testing';
import { MonthlyBillingCronService } from './monthly-billing-cron.service';
import { MonthlyChargeService } from './monthly-charge.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

describe('MonthlyBillingCronService', () => {
  let cron: MonthlyBillingCronService;
  let prismaMock: any;
  let monthlyChargeMock: any;
  let settingsMock: any;

  beforeEach(async () => {
    prismaMock = {
      company: { findMany: jest.fn().mockResolvedValue([{ id: 1 }]) },
    };
    monthlyChargeMock = {
      createChargesForPeriod: jest
        .fn()
        .mockResolvedValue({ created: 0, skipped: 0, totalCharged: 0 }),
    };
    // Boshlang'ich qiymat (1) — mavjud testlar shu bilan o'zgarishsiz
    // o'tadi. `payment.chargeDayOfMonth`ga xos testlar buni qayta belgilaydi.
    settingsMock = {
      get: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonthlyBillingCronService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MonthlyChargeService, useValue: monthlyChargeMock },
        { provide: SettingsService, useValue: settingsMock },
      ],
    }).compile();

    cron = module.get(MonthlyBillingCronService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('faqat oyning 1-kuni ishlaydi', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-05T02:05:00+05:00'));
    await cron.chargeMonthlyFees();
    expect(monthlyChargeMock.createChargesForPeriod).not.toHaveBeenCalled();
  });

  it('1-kuni joriy oy uchun hisob yaratadi', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T02:05:00+05:00'));
    await cron.chargeMonthlyFees();
    expect(monthlyChargeMock.createChargesForPeriod).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 1,
        periodYear: 2026,
        periodMonth: 10,
      }),
    );
  });

  it('yarim tunga yaqin — Tashkent vaqti bo`yicha hali 1-kun', async () => {
    // 2026-09-30T20:05:00Z = 2026-10-01T01:05:00 Toshkentda (UTC+5).
    jest.useFakeTimers().setSystemTime(new Date('2026-09-30T20:05:00Z'));
    await cron.chargeMonthlyFees();
    expect(monthlyChargeMock.createChargesForPeriod).toHaveBeenCalledWith(
      expect.objectContaining({ periodYear: 2026, periodMonth: 10 }),
    );
  });

  it('bir kompaniya yiqilsa boshqasini to`xtatmaydi', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T02:05:00+05:00'));
    prismaMock.company.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    monthlyChargeMock.createChargesForPeriod
      .mockRejectedValueOnce(new Error('baza yiqildi'))
      .mockResolvedValueOnce({
        created: 5,
        skipped: 0,
        totalCharged: 2_250_000,
      });

    await expect(cron.chargeMonthlyFees()).resolves.toBeUndefined();
    expect(monthlyChargeMock.createChargesForPeriod).toHaveBeenCalledTimes(2);
  });

  it('payment.chargeDayOfMonth sozlansa — sozlangan kungacha kutadi', async () => {
    settingsMock.get.mockResolvedValue(15);
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T02:05:00+05:00'));
    await cron.chargeMonthlyFees();
    expect(monthlyChargeMock.createChargesForPeriod).not.toHaveBeenCalled();
  });

  it('payment.chargeDayOfMonth sozlangan kunda ishga tushadi', async () => {
    settingsMock.get.mockResolvedValue(15);
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T02:05:00+05:00'));
    await cron.chargeMonthlyFees();
    expect(monthlyChargeMock.createChargesForPeriod).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 1, periodYear: 2026, periodMonth: 10 }),
    );
  });

  it('har kompaniya o`z chargeDayOfMonth qiymati bilan tekshiriladi', async () => {
    prismaMock.company.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    settingsMock.get.mockImplementation((companyId: number) =>
      Promise.resolve(companyId === 1 ? 1 : 15),
    );
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T02:05:00+05:00'));
    await cron.chargeMonthlyFees();
    expect(monthlyChargeMock.createChargesForPeriod).toHaveBeenCalledTimes(1);
    expect(monthlyChargeMock.createChargesForPeriod).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 1 }),
    );
  });
});
