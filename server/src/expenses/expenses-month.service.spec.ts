import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { utcMidnightFromDateStr } from '../common/date/tashkent';
import { ExpensesMonthService } from './expenses-month.service';
import { TaxSettingsService } from '../tax/tax-settings.service';
import type { MonthExpenseRow } from './expenses-month';

const NOW = new Date('2026-10-20T07:00:00Z');
const OCT_1 = utcMidnightFromDateStr('2026-10-01').getTime();

function row({
  day,
  ...o
}: Partial<MonthExpenseRow> & { day: string }): MonthExpenseRow {
  return {
    category: 'OTHER',
    description: '',
    amount: 0,
    paymentMethod: 'CASH',
    branchId: 1,
    createdById: 10001,
    ...o,
    date: utcMidnightFromDateStr(day),
  };
}

// Made-up month: two branches, a third inactive.
const OCTOBER = [
  row({ day: '2026-10-03', category: 'RENT', amount: 5_000_000 }),
  row({
    day: '2026-10-05',
    category: 'UTILITIES',
    amount: 70_000,
    paymentMethod: 'CARD',
    createdById: 10002,
  }),
];
const SEPTEMBER = [
  row({ day: '2026-09-28', category: 'RENT', amount: 5_000_000 }),
  row({ day: '2026-09-30', category: 'UTILITIES', amount: 4_700_000 }),
  row({
    day: '2026-09-30',
    category: 'OTHER',
    description: 'Soliqlar',
    amount: 1_200_000,
    branchId: 2,
  }),
];
const BRANCHES = [
  { id: 1, name: 'Markaz', status: 'ACTIVE', deletedAt: null },
  { id: 2, name: 'Shimol', status: 'ACTIVE', deletedAt: null },
  { id: 3, name: 'Janub', status: 'INACTIVE', deletedAt: null },
];

describe('ExpensesMonthService.monthSummary (spec B6 §5.2)', () => {
  let service: ExpensesMonthService;
  const prisma = {
    expense: { findMany: jest.fn() },
    branch: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const taxSettings = { loadRates: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.expense.findMany.mockImplementation(
      ({ where }: { where: { date: { gte: Date } } }) =>
        Promise.resolve(
          where.date.gte.getTime() === OCT_1 ? OCTOBER : SEPTEMBER,
        ),
    );
    prisma.branch.findMany.mockResolvedValue(BRANCHES);
    taxSettings.loadRates.mockResolvedValue({
      rates: { 'tax.turnoverPercent': [] },
      bankTiers: [],
    });
    prisma.user.findMany.mockResolvedValue([
      { id: 10002, firstName: 'Ism', lastName: 'Aliyev' },
      { id: 10001, firstName: 'Ism', lastName: 'Karimov' },
    ]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExpensesMonthService,
        { provide: PrismaService, useValue: prisma },
        { provide: TaxSettingsService, useValue: taxSettings },
      ],
    }).compile();
    service = moduleRef.get(ExpensesMonthService);
  });

  it('the current month: totals, eight categories, the per-branch gaps, the empty branch, the authors', async () => {
    const s = await service.monthSummary(1, null, undefined, NOW);
    expect(s).toMatchObject({
      month: '2026-10',
      isCurrentMonth: true,
      total: 5_070_000,
      count: 2,
      cashTotal: 5_000_000,
      cardTotal: 70_000,
      lastMonthTotal: 10_900_000,
      multiBranch: true,
    });
    expect(s.byCategory).toHaveLength(8);
    expect(s.byCategory.find((r) => r.category === 'UTILITIES')).toEqual({
      category: 'UTILITIES',
      amount: 70_000,
      count: 1,
      lastMonthAmount: 4_700_000,
      notRecorded: false,
    });
    // Tax written under «Boshqa» stays in that row; the warning still counts it (spec §10).
    expect(
      s.byCategory.find((r) => r.category === 'OTHER')?.lastMonthAmount,
    ).toBe(1_200_000);
    expect(s.missing).toEqual([
      {
        key: 'UTILITIES',
        branchId: 1,
        branchName: 'Markaz',
        amount: 4_630_000,
        lastMonthAmount: 4_700_000,
        thisMonthAmount: 70_000,
      },
      {
        key: 'TAXES',
        branchId: 2,
        branchName: 'Shimol',
        amount: 1_200_000,
        lastMonthAmount: 1_200_000,
        thisMonthAmount: 0,
      },
    ]);
    expect(s.emptyBranches).toEqual([{ id: 2, name: 'Shimol' }]);
    expect(s.creators).toEqual([
      { id: 10002, firstName: 'Ism', lastName: 'Aliyev' },
      { id: 10001, firstName: 'Ism', lastName: 'Karimov' },
    ]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 1, id: { in: [10001, 10002] } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    );
  });

  it('a past month carries no warning rows', async () => {
    const s = await service.monthSummary(1, null, '2026-09', NOW);
    expect(s.isCurrentMonth).toBe(false);
    expect(s.missing).toEqual([]);
    expect(s.emptyBranches).toEqual([]);
    expect(s.byCategory.some((r) => r.notRecorded)).toBe(false);
  });

  it('reads the canonical set: company, live, no advance, the month window (lt), this month then last month', async () => {
    await service.monthSummary(1, null, undefined, NOW);
    const [first, second] = prisma.expense.findMany.mock.calls.map(
      (c: [{ where: unknown }]) => c[0].where,
    );
    expect(first).toEqual({
      companyId: 1,
      deletedAt: null,
      category: { not: 'TEACHER_ADVANCE' },
      date: {
        gte: new Date('2026-10-01T00:00:00.000Z'),
        lt: new Date('2026-11-01T00:00:00.000Z'),
      },
    });
    expect(second).toMatchObject({
      date: {
        gte: new Date('2026-09-01T00:00:00.000Z'),
        lt: new Date('2026-10-01T00:00:00.000Z'),
      },
    });
  });

  it('with a scope, every expense read carries the branch predicate, and the branch list is scoped too', async () => {
    await service.monthSummary(1, [2], undefined, NOW);
    for (const [arg] of prisma.expense.findMany.mock.calls as [
      { where: { branchId?: unknown } },
    ][]) {
      expect(arg.where.branchId).toEqual({ in: [2] });
    }
    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 1, id: { in: [2] } } }),
    );
  });

  it('no author this month → no user read', async () => {
    prisma.expense.findMany.mockResolvedValue([]);
    const s = await service.monthSummary(1, null, undefined, NOW);
    expect(s.creators).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('refuses a month outside May 2026 … now', async () => {
    await expect(
      service.monthSummary(1, null, '2026-04', NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });

  it('a branch with only an advance this month counts as empty, and the advance is in no figure', async () => {
    const advance = row({
      day: '2026-10-08',
      category: 'TEACHER_ADVANCE',
      amount: 900_000,
      branchId: 2,
    });
    // Honours the one predicate this case is about, like the database does.
    prisma.expense.findMany.mockImplementation(
      ({
        where,
      }: {
        where: { date: { gte: Date }; category: { not: string } };
      }) =>
        Promise.resolve(
          (where.date.gte.getTime() === OCT_1
            ? [...OCTOBER, advance]
            : SEPTEMBER
          ).filter((r) => r.category !== where.category.not),
        ),
    );
    const s = await service.monthSummary(1, null, undefined, NOW);
    expect(s.total).toBe(5_070_000);
    expect(s.count).toBe(2);
    expect(s.emptyBranches).toEqual([{ id: 2, name: 'Shimol' }]);
  });

  it('a deleted branch is never offered as empty and does not make the scope multi-branch', async () => {
    prisma.branch.findMany.mockResolvedValue([
      BRANCHES[0],
      {
        id: 2,
        name: 'Shimol',
        status: 'ACTIVE',
        deletedAt: new Date('2026-10-01T00:00:00Z'),
      },
    ]);
    const s = await service.monthSummary(1, null, undefined, NOW);
    expect(s.emptyBranches).toEqual([]);
    expect(s.multiBranch).toBe(false);
  });

  it('drops the tax gap once the turnover tax is automatic', async () => {
    taxSettings.loadRates.mockResolvedValue({
      rates: { 'tax.turnoverPercent': [{ fromMonth: '2026-01', value: 4 }] },
      bankTiers: [],
    });
    const s = await service.monthSummary(1, null, undefined, NOW);
    expect(s.missing.some((m) => m.key === 'TAXES')).toBe(false);
    expect(s.missing.some((m) => m.key === 'UTILITIES')).toBe(true);
  });

  it('a failing tax settings read never breaks the page: the tax gap stays', async () => {
    taxSettings.loadRates.mockRejectedValue(new Error('settings down'));
    const s = await service.monthSummary(1, null, undefined, NOW);
    expect(s.month).toBe('2026-10');
    expect(s.missing.some((m) => m.key === 'TAXES')).toBe(true);
  });

  it('a deleted or inactive branch gets no missing row, an active one still does', async () => {
    prisma.branch.findMany.mockResolvedValue([
      BRANCHES[0],
      {
        id: 2,
        name: 'Shimol',
        status: 'ACTIVE',
        deletedAt: new Date('2026-10-01T00:00:00Z'),
      },
    ]);
    const gone = await service.monthSummary(1, null, undefined, NOW);
    expect(gone.missing.some((m) => m.branchId === 2)).toBe(false);
    expect(gone.missing.some((m) => m.branchId === 1)).toBe(true);
    prisma.branch.findMany.mockResolvedValue([
      BRANCHES[0],
      { id: 2, name: 'Shimol', status: 'INACTIVE', deletedAt: null },
    ]);
    const idle = await service.monthSummary(1, null, undefined, NOW);
    expect(idle.missing.some((m) => m.branchId === 2)).toBe(false);
  });

  it('a branch id the branch list does not know still gets a name, never a blank', async () => {
    prisma.branch.findMany.mockResolvedValue([BRANCHES[0]]);
    const s = await service.monthSummary(1, null, undefined, NOW);
    const gap = s.missing.find((m) => m.branchId === 2);
    expect(gap?.branchName).toBeTruthy();
    expect(gap?.branchName).not.toBe('');
  });
});
