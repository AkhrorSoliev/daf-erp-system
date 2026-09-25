import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SalaryPaymentStatus, SalaryType } from '@prisma/client';
import { SalaryConfigService } from './salary-config.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Focused on `deactivateConfigsForUser` — the 4b cascade that stops payroll for
 * a deactivated / terminated / archived employee by closing their FIXED_MONTHLY
 * configs (isActive=false) AND their open versions (effectiveTo set), so the
 * final month prorates and later months prorate to 0.
 */
describe('SalaryConfigService.deactivateConfigsForUser', () => {
  let service: SalaryConfigService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      employeeSalaryConfigVersion: {
        updateMany: jest.fn().mockResolvedValue({}),
      },
      employeeSalaryConfig: { updateMany: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      employeeSalaryConfig: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryConfigService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(SalaryConfigService);
  });

  it('is a no-op when the user has no active FIXED_MONTHLY config', async () => {
    const closed = await service.deactivateConfigsForUser(10030, 1);
    expect(closed).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('closes the open version and deactivates each config', async () => {
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([
      { id: 'cfg1' },
      { id: 'cfg2' },
    ]);
    const asOf = new Date('2026-06-16T00:00:00.000Z');

    const closed = await service.deactivateConfigsForUser(10030, 1, asOf);

    expect(closed).toBe(2);
    // Only ACTIVE FIXED_MONTHLY configs for this user are targeted.
    expect(prisma.employeeSalaryConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 10030,
          companyId: 1,
          isActive: true,
          salaryType: 'FIXED_MONTHLY',
        }),
      }),
    );
    // Open versions closed at the deactivation date.
    expect(tx.employeeSalaryConfigVersion.updateMany).toHaveBeenCalledWith({
      where: { configId: { in: ['cfg1', 'cfg2'] }, effectiveTo: null },
      data: { effectiveTo: asOf },
    });
    // Configs flipped inactive.
    expect(tx.employeeSalaryConfig.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['cfg1', 'cfg2'] } },
      data: { isActive: false },
    });
  });
});

/**
 * `updateConfig` with `isActive: true` on a deactivated config. Deactivation
 * closed the config's last version, and accrual resolves the version active on
 * the lesson date — so a reactivation that only flips `isActive` leaves the
 * teacher assigned, "rated" on every check, and earning nothing.
 */
describe('SalaryConfigService.updateConfig — reactivation', () => {
  let service: SalaryConfigService;
  let tx: any;

  // The config's last version, closed when it was deactivated.
  const CLOSED_VERSION = {
    id: 'ver-1',
    configId: 'cfg-1',
    salaryType: SalaryType.PERCENTAGE,
    value: 30,
    effectiveFrom: new Date('2026-05-31T19:00:00.000Z'), // 01.06 00:00 Tashkent
    effectiveTo: new Date('2026-08-15T19:00:00.000Z'), // 16.08 00:00 Tashkent
    changedById: 7,
    companyId: 1,
    createdAt: new Date('2026-05-31T19:00:00.000Z'),
  };

  // `updateConfig` loads only OPEN versions with the config, so a deactivated
  // config arrives with `versions: []`.
  const config = (
    overrides: Partial<{ isActive: boolean; versions: any[] }> = {},
  ) => ({
    id: 'cfg-1',
    userId: 501,
    groupId: null,
    salaryType: SalaryType.PERCENTAGE,
    value: 30,
    isActive: false,
    companyId: 1,
    createdAt: new Date('2026-05-31T19:00:00.000Z'),
    updatedAt: new Date('2026-08-15T19:00:00.000Z'),
    versions: [] as any[],
    ...overrides,
  });

  beforeEach(async () => {
    tx = {
      employeeSalaryConfig: {
        findFirst: jest.fn().mockResolvedValue(config()),
        update: jest.fn(async ({ data }: any) => ({ ...config(), ...data })),
      },
      employeeSalaryConfigVersion: {
        findFirst: jest.fn().mockResolvedValue(CLOSED_VERSION),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      salaryPayment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = { $transaction: jest.fn(async (cb: any) => cb(tx)) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryConfigService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(SalaryConfigService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens exactly one version at the config rate and leaves the inactive gap unpaid', async () => {
    const result = await service.updateConfig(
      'cfg-1',
      { isActive: true, effectiveFrom: '2026-09-01' },
      1,
      7,
    );

    expect(tx.employeeSalaryConfigVersion.create).toHaveBeenCalledTimes(1);
    expect(tx.employeeSalaryConfigVersion.create).toHaveBeenCalledWith({
      data: {
        configId: 'cfg-1',
        salaryType: SalaryType.PERCENTAGE,
        value: 30,
        effectiveFrom: new Date('2026-08-31T19:00:00.000Z'), // 01.09 Tashkent
        effectiveTo: null,
        changedById: 7,
        companyId: 1,
      },
    });
    // The closed version keeps its 16.08 end. Stretching it to 01.09 would
    // pay the weeks the config was switched off.
    expect(tx.employeeSalaryConfigVersion.update).not.toHaveBeenCalled();
    expect(tx.employeeSalaryConfigVersion.updateMany).not.toHaveBeenCalled();
    expect(result.isActive).toBe(true);
  });

  it('defaults the new version to 00:00 Tashkent of today', async () => {
    // 10.09 03:30 in Tashkent, still 09.09 in UTC.
    jest.useFakeTimers({ now: new Date('2026-09-09T22:30:00.000Z') });

    await service.updateConfig('cfg-1', { isActive: true }, 1, 7);

    expect(tx.employeeSalaryConfigVersion.create).toHaveBeenCalledTimes(1);
    expect(tx.employeeSalaryConfigVersion.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        effectiveFrom: new Date('2026-09-09T19:00:00.000Z'), // 10.09 Tashkent
        effectiveTo: null,
      }),
    );
  });

  it('opens one version, not two, when the reactivation also changes the rate', async () => {
    await service.updateConfig(
      'cfg-1',
      { isActive: true, value: 35, effectiveFrom: '2026-09-01' },
      1,
      7,
    );

    expect(tx.employeeSalaryConfigVersion.create).toHaveBeenCalledTimes(1);
    expect(tx.employeeSalaryConfigVersion.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ salaryType: SalaryType.PERCENTAGE, value: 35 }),
    );
  });

  it('refuses a reactivation dated inside an APPROVED/PAID salary period', async () => {
    tx.salaryPayment.findFirst.mockResolvedValue({
      id: 'sp-1',
      periodStart: new Date('2026-08-31T19:00:00.000Z'),
      periodEnd: new Date('2026-09-30T18:59:59.999Z'),
      status: SalaryPaymentStatus.APPROVED,
    });

    await expect(
      service.updateConfig(
        'cfg-1',
        { isActive: true, effectiveFrom: '2026-09-10' },
        1,
        7,
      ),
    ).rejects.toThrow(BadRequestException);

    // The guard looked for a closed period of THIS employee around the date.
    const E = new Date('2026-09-09T19:00:00.000Z'); // 10.09 Tashkent
    expect(tx.salaryPayment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 501,
          companyId: 1,
          status: {
            in: [SalaryPaymentStatus.APPROVED, SalaryPaymentStatus.PAID],
          },
          periodStart: { lte: E },
          periodEnd: { gte: E },
        }),
      }),
    );
    expect(tx.employeeSalaryConfigVersion.create).not.toHaveBeenCalled();
    expect(tx.employeeSalaryConfigVersion.update).not.toHaveBeenCalled();
  });

  it('refuses a reactivation dated before the last (closed) version started', async () => {
    await expect(
      service.updateConfig(
        'cfg-1',
        { isActive: true, effectiveFrom: '2026-05-15' },
        1,
        7,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(tx.employeeSalaryConfigVersion.create).not.toHaveBeenCalled();
    expect(tx.employeeSalaryConfigVersion.update).not.toHaveBeenCalled();
  });

  it('ends the closed version at the new start instead of overlapping it', async () => {
    // 01.08 is before the 16.08 deactivation. An overlapping pair would be
    // summed twice by the FIXED_MONTHLY proration for 01.08–15.08.
    await service.updateConfig(
      'cfg-1',
      { isActive: true, effectiveFrom: '2026-08-01' },
      1,
      7,
    );

    const E = new Date('2026-07-31T19:00:00.000Z'); // 01.08 Tashkent
    expect(tx.employeeSalaryConfigVersion.update).toHaveBeenCalledTimes(1);
    expect(tx.employeeSalaryConfigVersion.update).toHaveBeenCalledWith({
      where: { id: 'ver-1' },
      data: { effectiveTo: E },
    });
    expect(tx.employeeSalaryConfigVersion.create).toHaveBeenCalledTimes(1);
    expect(tx.employeeSalaryConfigVersion.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ effectiveFrom: E, effectiveTo: null }),
    );
  });

  it.each([
    [
      'with an open version',
      [{ ...CLOSED_VERSION, id: 'ver-open', effectiveTo: null }],
    ],
    ['without an open version', []],
  ])(
    'writes nothing to the version history when the config is already active (%s)',
    async (_label, versions) => {
      tx.employeeSalaryConfig.findFirst.mockResolvedValue(
        config({ isActive: true, versions }),
      );

      await service.updateConfig(
        'cfg-1',
        { isActive: true, effectiveFrom: '2026-09-01' },
        1,
        7,
      );

      expect(tx.employeeSalaryConfigVersion.create).not.toHaveBeenCalled();
      expect(tx.employeeSalaryConfigVersion.update).not.toHaveBeenCalled();
      expect(tx.employeeSalaryConfigVersion.updateMany).not.toHaveBeenCalled();
      expect(tx.salaryPayment.findFirst).not.toHaveBeenCalled();
    },
  );

  it('only flips isActive when an inactive config still has an open version', async () => {
    // Older data: deactivated before deactivation closed versions. The open
    // version already covers the dates, so a second one would only split it.
    tx.employeeSalaryConfig.findFirst.mockResolvedValue(
      config({
        isActive: false,
        versions: [{ ...CLOSED_VERSION, id: 'ver-open', effectiveTo: null }],
      }),
    );

    const result = await service.updateConfig(
      'cfg-1',
      { isActive: true, effectiveFrom: '2026-09-01' },
      1,
      7,
    );

    expect(tx.employeeSalaryConfigVersion.create).not.toHaveBeenCalled();
    expect(tx.employeeSalaryConfigVersion.update).not.toHaveBeenCalled();
    expect(result.isActive).toBe(true);
  });
});
