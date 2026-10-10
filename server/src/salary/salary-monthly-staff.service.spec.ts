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

const createdBy = { id: 2, firstName: 'Admin', lastName: 'A' };
const advance = (
  id: string,
  amount: number,
  date: string,
  createdAt: string,
  relatedUserId = 10030,
) => ({
  id,
  amount,
  date: new Date(date),
  createdAt: new Date(createdAt),
  relatedUserId,
  paymentMethod: 'CASH' as const,
  createdBy,
});

describe('SalaryStaffMonthlyService', () => {
  let service: SalaryStaffMonthlyService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      employeeSalaryConfig: { findMany: jest.fn().mockResolvedValue([]) },
      employeeSalaryConfigVersion: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
      salaryPayment: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryStaffMonthlyService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(SalaryStaffMonthlyService);

    // A fixed clock decides which month is the OPEN one (its advances are not
    // capped, spec §3): 10 Oct 2026, so June is a past month unless a case
    // moves the clock back into it.
    jest.useFakeTimers({ now: new Date('2026-10-10T07:00:00Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns empty when there are no fixed-monthly staff configs', async () => {
    const res = await service.computeStaff(juneScope());
    expect(res.staff).toEqual([]);
    expect(res.staffTotals).toEqual({
      monthly: 0,
      advances: 0,
      netToPay: 0,
      advanceCount: 0,
    });
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
      advanceCount: 0,
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
    prisma.expense.findMany.mockResolvedValue([
      advance('e1', 500_000, '2026-06-20', '2026-06-20T06:00:00Z'),
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
    prisma.salaryPayment.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 10030,
        amount: 4_500_000,
        status: 'PAID',
        paidAt: null,
        settledExpenses: [{ id: 's1', amount: 500_000 }],
      },
    ]);

    const res = await service.computeStaff(juneScope());

    expect(res.staff[0].netToPay).toBe(4_500_000); // payment.amount, not 4M
    expect(res.staff[0].payment?.status).toBe('PAID');
  });

  describe('«Avans» — what the payout nets (ADR-0082)', () => {
    const FULL_MONTH_3M = {
      configId: 'cfg1',
      value: 3_000_000,
      effectiveFrom: tsh(2026, 5, 1),
      effectiveTo: null,
    };

    beforeEach(() => {
      // 15 Jun 2026: June is the OPEN month unless a case says otherwise.
      jest.setSystemTime(new Date('2026-06-15T07:00:00Z'));
      prisma.employeeSalaryConfig.findMany.mockResolvedValue([adminConfig]);
      prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
        FULL_MONTH_3M,
      ]);
    });

    it('open month: nets the unsettled advance dated in the month', async () => {
      prisma.expense.findMany.mockResolvedValue([
        advance('e1', 500_000, '2026-06-12', '2026-06-12T06:00:00Z'),
      ]);

      const res = await service.computeStaff(juneScope());

      expect(res.staff[0].monthly).toBe(3_000_000);
      expect(res.staff[0].advances).toBe(500_000);
      expect(res.staff[0].netToPay).toBe(2_500_000);
      expect(res.staffTotals).toEqual({
        monthly: 3_000_000,
        advances: 500_000,
        netToPay: 2_500_000,
        advanceCount: 1,
      });
    });

    // Mid-month the prorated figure is what is known today: an advance above it
    // is shown whole, because the month-end payout will take it.
    it('open month: an advance above the prorated monthly is shown whole, net is 0', async () => {
      prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
        { ...FULL_MONTH_3M, effectiveFrom: tsh(2026, 6, 16) }, // 15/30 → 1 500 000
      ]);
      prisma.expense.findMany.mockResolvedValue([
        advance('big', 2_000_000, '2026-06-12', '2026-06-12T06:00:00Z'),
      ]);

      const res = await service.computeStaff(juneScope());

      expect(res.staff).toHaveLength(1);
      expect(res.staff[0].monthly).toBe(1_500_000);
      expect(res.staff[0].advances).toBe(2_000_000);
      expect(res.staff[0].netToPay).toBe(0);
      expect(res.staffTotals).toEqual({
        monthly: 1_500_000,
        advances: 2_000_000,
        netToPay: 0,
        advanceCount: 1,
      });
    });

    it('past month without a payment: an advance above the monthly does not fit — advances 0', async () => {
      jest.setSystemTime(new Date('2026-07-01T00:30:00Z'));
      prisma.expense.findMany.mockResolvedValue([
        advance('big', 3_500_000, '2026-06-12', '2026-06-12T06:00:00Z'),
      ]);

      const res = await service.computeStaff(juneScope());

      expect(res.staff[0].advances).toBe(0);
      expect(res.staff[0].netToPay).toBe(3_000_000);
      expect(res.staffTotals.advanceCount).toBe(0);
    });

    it('open month: asks only for unsettled advances dated before the end of the month', async () => {
      await service.computeStaff(juneScope());

      const where = prisma.expense.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        relatedUserId: { in: [10030] },
        category: 'TEACHER_ADVANCE',
        companyId: 1,
        deletedAt: null,
        settledBySalaryPaymentId: null,
      });
      expect(where.date).toEqual({ lt: new Date(Date.UTC(2026, 6, 1)) });
    });

    it('open month: an advance dated on the 1st of the next month is left for that month', async () => {
      prisma.expense.findMany.mockResolvedValue([
        advance('e1', 500_000, '2026-07-01', '2026-07-01T06:00:00Z'),
      ]);

      const res = await service.computeStaff(juneScope());

      expect(res.staff[0].advances).toBe(0);
      expect(res.staff[0].netToPay).toBe(3_000_000);
      expect(res.staffTotals.advanceCount).toBe(0);
    });

    it('calculated month: shows what the payment settled, an unsettled advance is not counted', async () => {
      prisma.salaryPayment.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 10030,
          amount: 2_500_000,
          status: 'CALCULATED',
          paidAt: null,
          settledExpenses: [{ id: 's1', amount: 500_000 }],
        },
      ]);
      prisma.expense.findMany.mockResolvedValue([
        advance('e2', 100_000, '2026-06-25', '2026-06-25T06:00:00Z'),
      ]);

      const res = await service.computeStaff(juneScope());

      expect(res.staff[0].advances).toBe(500_000);
      expect(res.staff[0].netToPay).toBe(2_500_000);
      expect(res.staffTotals.advanceCount).toBe(1);
      expect(res.staffTotals.advances).toBe(500_000);
    });

    it('passes the payment day through as an ISO string', async () => {
      prisma.salaryPayment.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 10030,
          amount: 3_000_000,
          status: 'PAID',
          paidAt: new Date('2026-07-02T05:00:00Z'),
          settledExpenses: [],
        },
      ]);

      const res = await service.computeStaff(juneScope());

      expect(res.staff[0].payment).toEqual({
        id: 'p1',
        amount: 3_000_000,
        status: 'PAID',
        paidAt: '2026-07-02T05:00:00.000Z',
      });
    });

    it('a single-user call lists the netted advances in netting order; the list call has none', async () => {
      prisma.expense.findMany.mockResolvedValue([
        advance('e-late', 200_000, '2026-06-12', '2026-06-12T06:00:00Z'),
        advance('e-early', 100_000, '2026-06-03', '2026-06-03T06:00:00Z'),
      ]);

      const one = await service.computeStaff(juneScope({ userId: 10030 }));
      expect(one.staff[0].advanceItems).toEqual([
        {
          id: 'e-early',
          date: new Date('2026-06-03'),
          amount: 100_000,
          paymentMethod: 'CASH',
          createdBy,
        },
        {
          id: 'e-late',
          date: new Date('2026-06-12'),
          amount: 200_000,
          paymentMethod: 'CASH',
          createdBy,
        },
      ]);

      const list = await service.computeStaff(juneScope());
      expect(list.staff[0]).not.toHaveProperty('advanceItems');
    });

    it('a single-user call on a calculated month lists the settled advances', async () => {
      prisma.salaryPayment.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 10030,
          amount: 2_500_000,
          status: 'PAID',
          paidAt: null,
          settledExpenses: [
            {
              id: 's-b',
              amount: 200_000,
              date: new Date('2026-06-08'),
              createdAt: new Date('2026-06-08T06:00:00Z'),
              paymentMethod: 'CARD',
              createdBy,
            },
            {
              id: 's-a',
              amount: 300_000,
              date: new Date('2026-06-02'),
              createdAt: new Date('2026-06-02T06:00:00Z'),
              paymentMethod: 'CASH',
              createdBy,
            },
          ],
        },
      ]);

      const res = await service.computeStaff(juneScope({ userId: 10030 }));

      expect(res.staff[0].advances).toBe(500_000);
      expect(res.staff[0].advanceItems?.map((i) => i.id)).toEqual([
        's-a',
        's-b',
      ]);
    });
  });

  it('narrows the staff roster to one user when the scope carries a userId', async () => {
    await service.computeStaff(juneScope({ userId: 10030 }));

    const where = prisma.employeeSalaryConfig.findMany.mock.calls[0][0].where;
    expect(where.user.id).toBe(10030);
  });

  describe("rate and coverage (the page's «Nimadan» column and drawer)", () => {
    it('a member who started on the 8th is on 23 of the 30 days, on the rate of that version', async () => {
      prisma.employeeSalaryConfig.findMany.mockResolvedValue([adminConfig]);
      prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
        {
          configId: 'cfg1',
          value: 5_000_000,
          effectiveFrom: tsh(2026, 6, 8), // Jun 8..30 = 23 of 30 days
          effectiveTo: null,
        },
      ]);

      const res = await service.computeStaff(juneScope());

      expect(res.staff[0].coverage).toEqual({ activeDays: 23, cycleDays: 30 });
      expect(res.staff[0].rate).toEqual({
        salaryType: 'FIXED_MONTHLY',
        value: 5_000_000,
      });
    });

    it('a full month is 30 of 30 days', async () => {
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

      expect(res.staff[0].coverage).toEqual({ activeDays: 30, cycleDays: 30 });
    });

    it('a rate change mid-month shows the rate in force on the last day', async () => {
      prisma.employeeSalaryConfig.findMany.mockResolvedValue([adminConfig]);
      prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
        {
          configId: 'cfg1',
          value: 3_000_000,
          effectiveFrom: tsh(2026, 5, 1),
          effectiveTo: tsh(2026, 6, 16),
        },
        {
          configId: 'cfg1',
          value: 6_000_000,
          effectiveFrom: tsh(2026, 6, 16),
          effectiveTo: null,
        },
      ]);

      const res = await service.computeStaff(juneScope());

      expect(res.staff[0].rate?.value).toBe(6_000_000);
      expect(res.staff[0].coverage).toEqual({ activeDays: 30, cycleDays: 30 });
    });

    it('a rate that ended inside the month shows the latest version of it', async () => {
      prisma.employeeSalaryConfig.findMany.mockResolvedValue([adminConfig]);
      prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
        {
          configId: 'cfg1',
          value: 4_000_000,
          effectiveFrom: tsh(2026, 5, 1),
          effectiveTo: tsh(2026, 6, 11), // left on the 11th: 10 of 30 days
        },
      ]);

      const res = await service.computeStaff(juneScope());

      expect(res.staff[0].rate).toEqual({
        salaryType: 'FIXED_MONTHLY',
        value: 4_000_000,
      });
      expect(res.staff[0].coverage).toEqual({ activeDays: 10, cycleDays: 30 });
    });

    it('a settled month with no version in it has no rate and no active days', async () => {
      prisma.employeeSalaryConfig.findMany.mockResolvedValue([adminConfig]);
      prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([]);
      prisma.salaryPayment.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 10030,
          amount: 1_000_000,
          status: 'PAID',
          paidAt: null,
          settledExpenses: [],
        },
      ]);

      const res = await service.computeStaff(juneScope());

      expect(res.staff[0].rate).toBeNull();
      expect(res.staff[0].coverage).toEqual({ activeDays: 0, cycleDays: 30 });
    });
  });

  it('drops a config with no active version and no settled payment', async () => {
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([adminConfig]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([]); // none overlap

    const res = await service.computeStaff(juneScope());
    expect(res.staff).toEqual([]);
  });
});

// A profit figure must count each salary once. Production 2026-09: an
// administrator (main branch Farg'ona) is attached to Namangan too, so the
// Namangan Foyda card subtracted his 3 000 000 while the company card counted
// it once — the two branches summed to 3 mln less than the whole.
describe('SalaryStaffMonthlyService — home-branch basis', () => {
  let service: SalaryStaffMonthlyService;
  let prisma: any;

  const version = (configId: string) => ({
    configId,
    value: 3_000_000,
    effectiveFrom: tsh(2026, 5, 1),
    effectiveTo: null,
  });
  const staffConfig = (
    id: string,
    userId: number,
    mainBranch: number | null,
    branchIds: number[],
  ) => ({
    id,
    userId,
    user: {
      firstName: id,
      lastName: '',
      position: 'Administrator',
      isActive: true,
      mainBranch,
      roles: [{ role: { name: 'Administrator' } }],
      branches: branchIds.map((b) => ({ branch: { id: b, name: `B${b}` } })),
    },
  });

  beforeEach(async () => {
    prisma = {
      employeeSalaryConfig: { findMany: jest.fn().mockResolvedValue([]) },
      employeeSalaryConfigVersion: {
        findMany: jest
          .fn()
          .mockResolvedValue([version('two'), version('solo'), version('x')]),
      },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
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

  it('asks for the home branch, under AND so a search OR cannot erase it', async () => {
    await service.computeStaff(
      juneScope({ branchId: 2, staffBranchBasis: 'home', search: 'a' }),
    );
    const where =
      prisma.employeeSalaryConfig.findMany.mock.calls[0][0].where.user;
    expect(where.branches).toBeUndefined();
    expect(where.AND).toEqual([
      {
        OR: [
          { mainBranch: 2 },
          { mainBranch: null, branches: { some: { branchId: 2 } } },
        ],
      },
    ]);
    expect(where.OR).toBeDefined(); // the search's own OR survives
  });

  it('drops a staff member whose main branch is elsewhere', async () => {
    // What the database returns for branch 2 under membership: both.
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([
      staffConfig('two', 20002, 1, [1, 2]),
      staffConfig('solo', 20001, 2, [2]),
    ]);
    const res = await service.computeStaff(
      juneScope({ branchId: 2, staffBranchBasis: 'home' }),
    );
    expect(res.staff.map((s) => s.user.id)).toEqual([20001]);
    expect(res.staffTotals.monthly).toBe(3_000_000);
  });

  it('places a person with no main branch in their lowest attached branch', async () => {
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([
      staffConfig('x', 30001, null, [2, 1]),
    ]);
    const inOne = await service.computeStaff(
      juneScope({ branchId: 1, staffBranchBasis: 'home' }),
    );
    const inTwo = await service.computeStaff(
      juneScope({ branchId: 2, staffBranchBasis: 'home' }),
    );
    expect(inOne.staff).toHaveLength(1);
    expect(inTwo.staff).toHaveLength(0);
  });

  it('keeps membership for the payroll page (no basis given)', async () => {
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([
      staffConfig('two', 20002, 1, [1, 2]),
    ]);
    const res = await service.computeStaff(juneScope({ branchId: 2 }));
    expect(res.staff).toHaveLength(1);
    const where =
      prisma.employeeSalaryConfig.findMany.mock.calls[0][0].where.user;
    expect(where.branches).toEqual({ some: { branchId: 2 } });
  });
});
