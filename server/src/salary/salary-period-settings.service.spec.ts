import { BadRequestException } from '@nestjs/common';
import { SalaryPeriodSettingsService } from './salary-period-settings.service';

/**
 * The payroll period is the calendar month (B3 §2.8): the monthly payment
 * system needs it, and production already runs on cycleStartDay 1. The write
 * refuses anything else before it reads or writes a thing.
 */
describe('SalaryPeriodSettingsService.create', () => {
  const REFUSAL =
    "Hisoblash davri — kalendar oyi (1-sanadan); o'zgartirilmaydi";
  let tx: {
    salaryPeriodSetting: {
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
  };
  let prisma: { $transaction: jest.Mock };
  let service: SalaryPeriodSettingsService;

  beforeEach(() => {
    tx = {
      salaryPeriodSetting: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 's1', ...data })),
      },
    };
    prisma = {
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    };
    service = new SalaryPeriodSettingsService(prisma as never);
  });

  it.each([2, 8, 28])(
    'refuses cycleStartDay %i and touches nothing',
    async (cycleStartDay) => {
      const call = service.create({ cycleStartDay }, 1, 10001);

      await expect(call).rejects.toBeInstanceOf(BadRequestException);
      await expect(call).rejects.toThrow(REFUSAL);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('refuses before it even parses a bad effectiveFrom', async () => {
    await expect(
      service.create(
        { cycleStartDay: 8, effectiveFrom: 'not-a-date' },
        1,
        10001,
      ),
    ).rejects.toThrow(REFUSAL);
  });

  it('cycleStartDay 1 proceeds as before', async () => {
    const created = await service.create({ cycleStartDay: 1 }, 1, 10001);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.salaryPeriodSetting.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 1,
        cycleStartDay: 1,
        changedById: 10001,
      }),
    });
    expect(created).toMatchObject({ cycleStartDay: 1 });
  });
});
