import { Test, TestingModule } from '@nestjs/testing';
import { SalaryStaffMonthlyService } from './salary-monthly-staff.service';
import { PrismaService } from '../prisma/prisma.service';
import { MonthlyScope } from './shared/resolve-monthly-scope';

/** Tashkent-midnight instant of a calendar date (UTC+5, no DST). */
const tsh = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d) - 5 * 60 * 60 * 1000);

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

// June 2026 scope (cycleStartDay=1 → the calendar month).
function juneScope(overrides: Partial<MonthlyScope> = {}): MonthlyScope {
  const monthStart = new Date(Date.UTC(2026, 5, 1));
  const nextMonthStart = new Date(Date.UTC(2026, 6, 1));
  return {
    companyId: 1,
    month: '2026-06',
    floorMonth: '2026-05',
    period: {
      periodStart: tsh(2026, 6, 1),
      periodEnd: new Date(tsh(2026, 7, 1).getTime() - 1),
      // The `@db.Date` half of `PeriodBounds`. It was added when the shifted
      // timestamp bound was found to pull 30 June into July — 1 819 343 so'm
      // on the production July payroll — and this fixture never followed, so
      // the service was under test with both fields undefined.
      periodStartDate: monthStart,
      periodEndDateExclusive: nextMonthStart,
      cycleStartDay: 1,
    },
    periodStart: tsh(2026, 6, 1),
    periodEnd: new Date(tsh(2026, 7, 1).getTime() - 1),
    // `MonthlyScope` re-exposes the `@db.Date` bounds at the top level; the
    // service reads them for `lessonDate`/`date` columns.
    periodStartDate: monthStart,
    periodEndDateExclusive: nextMonthStart,
    monthStart,
    nextMonthStart,
    periodStartLow: new Date(monthStart.getTime() - TASHKENT_OFFSET_MS),
    periodStartHigh: new Date(nextMonthStart.getTime() - TASHKENT_OFFSET_MS),
    branchId: undefined,
    // `blocked` marks a scope that resolved to no branches at all — the
    // fail-closed case. The fixture predates it; false is the normal path.
    blocked: false,
    search: undefined,
    searchId: null,
    userId: undefined,
    ...overrides,
  };
}

const adminConfig = {
  id: 'cfg1',
  userId: 10030,
  user: {
    firstName: 'Admin',
    lastName: 'One',
    roles: [{ role: { name: 'Administrator' } }],
    branches: [{ branch: { id: 1, name: 'Asosiy' } }],
  },
};

describe('SalaryStaffMonthlyService', () => {
  let service: SalaryStaffMonthlyService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      employeeSalaryConfig: { findMany: jest.fn().mockResolvedValue([]) },
      employeeSalaryConfigVersion: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      expense: { groupBy: jest.fn().mockResolvedValue([]) },
      salaryPayment: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryStaffMonthlyService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(SalaryStaffMonthlyService);
  });

  it('returns empty when there are no fixed-monthly staff configs', async () => {
    const res = await service.computeStaff(juneScope());
    expect(res.staff).toEqual([]);
    expect(res.staffTotals).toEqual({ monthly: 0, advances: 0, netToPay: 0 });
  });

  it('excludes teachers and archived users via the config query filter', async () => {
    await service.computeStaff(juneScope({ branchId: 7 }));
    expect(prisma.employeeSalaryConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groupId: null,
          salaryType: 'FIXED_MONTHLY',
          user: expect.objectContaining({
            deletedAt: null,
            roles: { none: { role: { name: 'Teacher' } } },
            branches: { some: { branchId: 7 } },
          }),
        }),
      }),
    );
  });

  it('pays the full month for a version spanning the whole period', async () => {
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([adminConfig]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        configId: 'cfg1',
        value: 5_000_000,
        effectiveFrom: tsh(2026, 5, 1),
        effectiveTo: null,
      },
    ]);

    const res = await service.computeStaff(juneScope());

    expect(res.staff).toHaveLength(1);
    expect(res.staff[0].user.position).toBe('Administrator');
    expect(res.staff[0].monthly).toBe(5_000_000);
    expect(res.staff[0].netToPay).toBe(5_000_000);
    expect(res.staffTotals).toEqual({
      monthly: 5_000_000,
      advances: 0,
      netToPay: 5_000_000,
    });
  });

  // The point of the whole staff section: a cleaner is on payroll and has NO
  // system role. Reading the position from `roles[0]` printed "—" for exactly
  // that employee. The test above keeps the role-name fallback honest for
  // accounts created before `User.position` existed.
  it("names a role-less employee by their position (roles[0] would be '—')", async () => {
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([
      {
        id: 'cfg1',
        userId: 10500,
        user: {
          firstName: 'Zulfiya',
          lastName: 'Karimova',
          position: 'Farrosh',
          roles: [], // rolsiz xodim
          branches: [{ branch: { id: 7, name: "Farg'ona filiali" } }],
        },
      },
    ]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        configId: 'cfg1',
        value: 2_000_000,
        effectiveFrom: tsh(2026, 5, 1),
        effectiveTo: null,
      },
    ]);

    const res = await service.computeStaff(juneScope());

    expect(res.staff).toHaveLength(1);
    expect(res.staff[0].user.position).toBe('Farrosh');
  });

  it('prefers the job title over the role name when both exist', async () => {
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([
      {
        ...adminConfig,
        user: { ...adminConfig.user, position: 'Bosh administrator' },
      },
    ]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        configId: 'cfg1',
        value: 5_000_000,
        effectiveFrom: tsh(2026, 5, 1),
        effectiveTo: null,
      },
    ]);

    const res = await service.computeStaff(juneScope());
    expect(res.staff[0].user.position).toBe('Bosh administrator');
  });

  it('asks the database for the job title', async () => {
    await service.computeStaff(juneScope());
    const select =
      prisma.employeeSalaryConfig.findMany.mock.calls[0][0].select.user.select;
    expect(select.position).toBe(true);
  });

  it('prorates a mid-cycle hire and nets advances', async () => {
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([adminConfig]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        configId: 'cfg1',
        value: 5_000_000,
        effectiveFrom: tsh(2026, 6, 16), // Jun 16..30 = 15/30 → 2_500_000
        effectiveTo: null,
      },
    ]);
    prisma.expense.groupBy.mockResolvedValue([
      { relatedUserId: 10030, _sum: { amount: 500_000 } },
    ]);

    const res = await service.computeStaff(juneScope());

    expect(res.staff[0].monthly).toBe(2_500_000);
    expect(res.staff[0].advances).toBe(500_000);
    expect(res.staff[0].netToPay).toBe(2_000_000); // 2.5M − 0.5M avans
  });

  it('uses the settled payment amount (never double-subtracts advances)', async () => {
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([adminConfig]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        configId: 'cfg1',
        value: 5_000_000,
        effectiveFrom: tsh(2026, 5, 1),
        effectiveTo: null,
      },
    ]);
    prisma.expense.groupBy.mockResolvedValue([
      { relatedUserId: 10030, _sum: { amount: 500_000 } },
    ]);
    prisma.salaryPayment.findMany.mockResolvedValue([
      { id: 'p1', userId: 10030, amount: 4_500_000, status: 'PAID' },
    ]);

    const res = await service.computeStaff(juneScope());

    expect(res.staff[0].netToPay).toBe(4_500_000); // payment.amount, not 4M
    expect(res.staff[0].payment?.status).toBe('PAID');
  });

  it('narrows the staff roster to one user when the scope carries a userId', async () => {
    await service.computeStaff(juneScope({ userId: 10030 }));

    const where = prisma.employeeSalaryConfig.findMany.mock.calls[0][0].where;
    expect(where.user.id).toBe(10030);
  });

  it('drops a config with no active version and no settled payment', async () => {
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([adminConfig]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([]); // none overlap

    const res = await service.computeStaff(juneScope());
    expect(res.staff).toEqual([]);
  });
});
