import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SalaryPaymentStatus, SalaryType } from '@prisma/client';
import { SalaryConfigService } from './salary-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { prorateFixedMonthly } from './shared/prorate-fixed-monthly';

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

/**
 * POST /salary/config and POST /salary/config/global on a deactivated config.
 * Both load only OPEN versions, so a config whose versions are all closed
 * arrives with `versions: []`; without its last closed version as reference a
 * new version could start on top of dates that version already covers.
 */
describe('SalaryConfigService — POST on a deactivated config', () => {
  let service: SalaryConfigService;
  let prisma: any;
  let tx: any;

  // The last version, closed when the config was switched off.
  const CLOSED = {
    id: 'ver-1',
    effectiveFrom: new Date('2026-05-31T19:00:00.000Z'), // 01.06 Tashkent
    effectiveTo: new Date('2026-08-15T19:00:00.000Z'), // 16.08 Tashkent
  };
  const config = (userId: number, overrides: Record<string, unknown> = {}) => ({
    id: `cfg-${userId}`,
    userId,
    groupId: null,
    salaryType: SalaryType.FIXED_MONTHLY,
    value: 5_000_000,
    isActive: false,
    companyId: 1,
    createdAt: CLOSED.effectiveFrom,
    updatedAt: CLOSED.effectiveTo,
    versions: [] as any[],
    ...overrides,
  });

  beforeEach(async () => {
    tx = {
      employeeSalaryConfig: {
        findFirst: jest.fn().mockResolvedValue(config(501)),
        create: jest.fn(),
        update: jest.fn(async ({ data }: any) => ({ ...config(501), ...data })),
      },
      employeeSalaryConfigVersion: {
        findFirst: jest.fn().mockResolvedValue(CLOSED),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      salaryPayment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    // Reads outside a transaction hit the same mocks.
    prisma = {
      ...tx,
      groupTeacher: { findMany: jest.fn().mockResolvedValue([]) },
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

  const post = (effectiveFrom: string, value = 5_000_000) =>
    service.createConfig(
      {
        userId: 501,
        salaryType: SalaryType.FIXED_MONTHLY,
        value,
        effectiveFrom,
      },
      1,
      7,
    );

  describe('createConfig', () => {
    it('refuses a date before the last (closed) version started', async () => {
      await expect(post('2026-05-15')).rejects.toThrow(BadRequestException);

      expect(tx.employeeSalaryConfigVersion.create).not.toHaveBeenCalled();
      expect(tx.employeeSalaryConfigVersion.update).not.toHaveBeenCalled();
    });

    it('cuts the closed version back to a start inside it, so no day is paid twice', async () => {
      await post('2026-08-10', 6_000_000);

      const E = new Date('2026-08-09T19:00:00.000Z'); // 10.08 Tashkent
      expect(tx.employeeSalaryConfigVersion.update).toHaveBeenCalledTimes(1);
      expect(tx.employeeSalaryConfigVersion.update).toHaveBeenCalledWith({
        where: { id: 'ver-1' },
        data: { effectiveTo: E },
      });
      expect(tx.employeeSalaryConfigVersion.create).toHaveBeenCalledTimes(1);
      const created =
        tx.employeeSalaryConfigVersion.create.mock.calls[0][0].data;
      expect(created).toEqual(
        expect.objectContaining({ effectiveFrom: E, effectiveTo: null }),
      );

      // August pays 9 days at the old rate and 22 at the new one — not 15 + 22.
      const august = prorateFixedMonthly(
        [
          {
            value: 5_000_000,
            effectiveFrom: CLOSED.effectiveFrom,
            effectiveTo: E,
          },
          { value: created.value, effectiveFrom: E, effectiveTo: null },
        ],
        new Date('2026-07-31T19:00:00.000Z'),
        new Date('2026-08-31T18:59:59.999Z'),
      );
      expect(august).toBe(
        Math.round((5_000_000 * 9) / 31) + Math.round((6_000_000 * 22) / 31),
      );
    });

    it('leaves a closed version that ended before the new start untouched', async () => {
      await post('2026-09-01');

      // Stretching it to 01.09 would pay the days the config was off.
      expect(tx.employeeSalaryConfigVersion.update).not.toHaveBeenCalled();
      expect(tx.employeeSalaryConfigVersion.create).toHaveBeenCalledTimes(1);
      expect(
        tx.employeeSalaryConfigVersion.create.mock.calls[0][0].data,
      ).toEqual(
        expect.objectContaining({
          effectiveFrom: new Date('2026-08-31T19:00:00.000Z'),
          effectiveTo: null,
        }),
      );
    });
  });

  describe('applyGlobalConfig', () => {
    // 501 is active with an open version; 502 is deactivated.
    const OPEN_501 = { ...CLOSED, id: 'ver-501', effectiveTo: null };
    beforeEach(() => {
      prisma.groupTeacher.findMany.mockResolvedValue([
        { teacherId: 501 },
        { teacherId: 502 },
      ]);
      tx.employeeSalaryConfig.findFirst.mockImplementation(
        async ({ where }: any) =>
          where.userId === 501
            ? config(501, { isActive: true, versions: [OPEN_501] })
            : config(502),
      );
    });

    const apply = (effectiveFrom: string) =>
      service.applyGlobalConfig(
        { salaryType: SalaryType.PERCENTAGE, value: 35, effectiveFrom },
        1,
        7,
      );

    it.each([
      [
        "502's closed version starts after the date",
        () =>
          tx.employeeSalaryConfigVersion.findFirst.mockResolvedValue({
            ...CLOSED,
            effectiveFrom: new Date('2026-08-31T19:00:00.000Z'), // 01.09
            effectiveTo: new Date('2026-09-14T19:00:00.000Z'), // 15.09
          }),
      ],
      [
        "502's salary for the date is already paid",
        () =>
          tx.salaryPayment.findFirst.mockImplementation(
            async ({ where }: any) =>
              where.userId === 502
                ? {
                    id: 'sp-1',
                    periodStart: new Date('2026-07-31T19:00:00.000Z'),
                    periodEnd: new Date('2026-08-31T18:59:59.999Z'),
                    status: SalaryPaymentStatus.PAID,
                  }
                : null,
          ),
      ],
    ])(
      'writes nothing for anyone when one teacher is refused (%s)',
      async (_label, arrange) => {
        arrange();

        await expect(apply('2026-08-20')).rejects.toThrow(/#502/);

        // 501 comes first in the loop and would otherwise keep the new rate.
        expect(tx.employeeSalaryConfigVersion.create).not.toHaveBeenCalled();
        expect(tx.employeeSalaryConfigVersion.update).not.toHaveBeenCalled();
        expect(tx.employeeSalaryConfig.update).not.toHaveBeenCalled();
        expect(tx.employeeSalaryConfig.create).not.toHaveBeenCalled();
      },
    );

    it("cuts a deactivated teacher's closed version back like POST does", async () => {
      const result = await apply('2026-08-10');

      const E = new Date('2026-08-09T19:00:00.000Z'); // 10.08 Tashkent
      expect(result).toEqual({ updated: 2 });
      expect(tx.employeeSalaryConfigVersion.update).toHaveBeenCalledWith({
        where: { id: 'ver-1' },
        data: { effectiveTo: E },
      });
      expect(tx.employeeSalaryConfigVersion.update).toHaveBeenCalledWith({
        where: { id: 'ver-501' },
        data: { effectiveTo: E },
      });
      expect(tx.employeeSalaryConfigVersion.create).toHaveBeenCalledTimes(2);
    });
  });
});

/**
 * R4: the 100% cap on PERCENTAGE rates must only fire when the rate itself
 * changes. A legacy config saved before the cap existed (or grandfathered
 * above it) still has to be deactivatable — an isActive-only PATCH does not
 * touch `salaryType`/`value`, so it must not be blocked by a rate it isn't
 * changing.
 */
describe('SalaryConfigService.updateConfig — percentage cap only on rate change (R4)', () => {
  let service: SalaryConfigService;
  let prisma: any;
  let tx: any;

  const legacyOverCap = {
    id: 'cfg-1',
    userId: 90020,
    companyId: 1001,
    groupId: null,
    salaryType: SalaryType.PERCENTAGE,
    value: 120,
    versions: [],
  };

  beforeEach(async () => {
    tx = {
      employeeSalaryConfig: {
        findFirst: jest.fn().mockResolvedValue(legacyOverCap),
        update: jest.fn().mockResolvedValue({ ...legacyOverCap }),
      },
      employeeSalaryConfigVersion: {
        updateMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      salaryPayment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    prisma = {
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

  it('allows deactivating a legacy PERCENTAGE config already above 100%', async () => {
    await expect(
      service.updateConfig('cfg-1', { isActive: false }, 1001),
    ).resolves.toBeDefined();

    // No new version written — isActive-only is a deactivation, not a rate
    // change, and the cap check must not have run before this either.
    expect(tx.employeeSalaryConfigVersion.create).not.toHaveBeenCalled();
    expect(tx.employeeSalaryConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cfg-1' },
        data: expect.objectContaining({ isActive: false }),
      }),
    );
  });

  it('refuses switching a legacy over-cap config back on without a valid value', async () => {
    // Reactivation writes a new version, which would pay 120% from today on.
    tx.employeeSalaryConfig.findFirst.mockResolvedValue({
      ...legacyOverCap,
      isActive: false,
    });

    await expect(
      service.updateConfig('cfg-1', { isActive: true }, 1001),
    ).rejects.toThrow('Foiz 100 dan oshmasligi kerak');
    expect(tx.employeeSalaryConfigVersion.create).not.toHaveBeenCalled();
    expect(tx.employeeSalaryConfig.update).not.toHaveBeenCalled();
  });

  it('still refuses changing the value to above 100%', async () => {
    // A currently-valid 30% config — this PATCH actually changes the rate,
    // so (unlike the deactivation above) the cap must still apply.
    tx.employeeSalaryConfig.findFirst.mockResolvedValue({
      ...legacyOverCap,
      value: 30,
    });

    await expect(
      service.updateConfig('cfg-1', { value: 120 }, 1001),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.updateConfig('cfg-1', { value: 120 }, 1001),
    ).rejects.toThrow('Foiz 100 dan oshmasligi kerak');
  });

  it('still refuses raising an already-over-cap config to an even higher value', async () => {
    // existing.value is 120 (already over cap); requesting 150 still counts
    // as a rate change, so the cap must re-apply.
    await expect(
      service.updateConfig(
        'cfg-1',
        { salaryType: SalaryType.PERCENTAGE, value: 150 },
        1001,
      ),
    ).rejects.toThrow('Foiz 100 dan oshmasligi kerak');
  });
});

/**
 * R5: `@IsDateString()` on the DTO accepts any ISO-8601 date-TIME, not just
 * `YYYY-MM-DD` — a full instant slips past validation and into
 * `parseTashkentDateStart`, which appends its own time suffix and produces
 * an unparseable string. That must surface as a 400 before any write, not as
 * a silently-wrong `Invalid Date` written into the version's `effectiveFrom`.
 */
describe('SalaryConfigService.createConfig — invalid effectiveFrom (R5)', () => {
  let service: SalaryConfigService;
  let prisma: any;

  beforeEach(async () => {
    prisma = { $transaction: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryConfigService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(SalaryConfigService);
  });

  it('refuses a non-YYYY-MM-DD effectiveFrom with 400 instead of writing an Invalid Date', async () => {
    const dto = {
      userId: 90020,
      salaryType: SalaryType.PERCENTAGE,
      value: 30,
      effectiveFrom: '2026-08-20T00:00:00Z',
    } as any;

    await expect(service.createConfig(dto, 1001)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.createConfig(dto, 1001)).rejects.toThrow(
      "Sana noto'g'ri formatda",
    );
    // Refused before any transaction was even opened.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
