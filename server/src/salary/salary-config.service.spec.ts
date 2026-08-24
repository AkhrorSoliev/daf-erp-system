import { Test, TestingModule } from '@nestjs/testing';
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
