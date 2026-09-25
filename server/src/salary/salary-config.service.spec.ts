import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SalaryType } from '@prisma/client';
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
