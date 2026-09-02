import { Test, TestingModule } from '@nestjs/testing';
import { MonthlyBillingCronService } from './monthly-billing-cron.service';
import { MonthlyChargeService } from './monthly-charge.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MonthlyBillingCronService', () => {
  let cron: MonthlyBillingCronService;
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
        MonthlyBillingCronService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MonthlyChargeService, useValue: monthlyChargeMock },
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
});
