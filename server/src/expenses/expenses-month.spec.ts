import { BadRequestException } from '@nestjs/common';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { missingRecurringExpenses } from '../reports/profit-composition';
import {
  buildCategoryRows,
  emptyBranches,
  expenseMonthTitle,
  expenseMonthWindow,
  missingByBranch,
  PAGE_CATEGORIES,
  parseExpenseMonth,
  summarize,
  type MonthExpenseRow,
} from './expenses-month';

const NOW = new Date('2026-10-20T07:00:00Z'); // 20.10.2026 12:00 Tashkent

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

describe('parseExpenseMonth (spec B6 §4.1)', () => {
  it('empty is the current Tashkent month', () => {
    expect(parseExpenseMonth(undefined, NOW)).toBe('2026-10');
    expect(parseExpenseMonth('', NOW)).toBe('2026-10');
  });
  it('accepts May 2026 up to the current month', () => {
    expect(parseExpenseMonth('2026-05', NOW)).toBe('2026-05');
    expect(parseExpenseMonth('2026-10', NOW)).toBe('2026-10');
  });
  it('refuses a month before May 2026 and a future month', () => {
    expect(() => parseExpenseMonth('2026-04', NOW)).toThrow(
      new BadRequestException("Xarajatlar may 2026 dan boshlab ko'rsatiladi"),
    );
    expect(() => parseExpenseMonth('2026-11', NOW)).toThrow(
      new BadRequestException("Kelajak oyni tanlab bo'lmaydi"),
    );
  });
  it('00:30 on the 1st in Tashkent is already the new month (19:30 UTC the day before)', () => {
    const nov1 = new Date('2026-10-31T19:30:00Z');
    expect(parseExpenseMonth(undefined, nov1)).toBe('2026-11');
    expect(parseExpenseMonth('2026-11', nov1)).toBe('2026-11');
  });
});

describe('expenseMonthWindow / expenseMonthTitle', () => {
  it('plain UTC midnights, the next 1st exclusive', () => {
    expect(expenseMonthWindow('2026-10')).toEqual({
      gte: new Date('2026-10-01T00:00:00.000Z'),
      lt: new Date('2026-11-01T00:00:00.000Z'),
    });
    expect(expenseMonthWindow('2026-12')).toEqual({
      gte: new Date('2026-12-01T00:00:00.000Z'),
      lt: new Date('2027-01-01T00:00:00.000Z'),
    });
  });
  it('names the month for the PDF', () => {
    expect(expenseMonthTitle('2026-10')).toBe('Oktabr 2026');
    expect(expenseMonthTitle('2026-05')).toBe('May 2026');
  });
});

describe('summarize', () => {
  it('total, count, cash and card', () => {
    const rows = [
      row({ day: '2026-10-02', amount: 300_000 }),
      row({ day: '2026-10-03', amount: 200_000, paymentMethod: 'CARD' }),
    ];
    expect(summarize(rows)).toEqual({
      total: 500_000,
      count: 2,
      cashTotal: 300_000,
      cardTotal: 200_000,
    });
  });
});

describe('buildCategoryRows (spec B6 §3.4, §5.2)', () => {
  const thisMonth = [
    row({ day: '2026-10-02', category: 'RENT', amount: 5_000_000 }),
    row({ day: '2026-10-03', category: 'OTHER', amount: 120_000 }),
    row({ day: '2026-10-04', category: 'OTHER', amount: 80_000 }),
  ];
  const lastMonth = [
    row({ day: '2026-09-28', category: 'RENT', amount: 5_000_000 }),
    row({ day: '2026-09-29', category: 'UTILITIES', amount: 4_700_000 }),
    row({ day: '2026-09-30', category: 'SUPPLIES', amount: 900_000 }),
  ];

  it('eight rows, the CEO order, never the advance', () => {
    const rows = buildCategoryRows(thisMonth, lastMonth, true);
    expect(rows.map((r) => r.category)).toEqual([...PAGE_CATEGORIES]);
    expect(rows.map((r) => r.category)).not.toContain('TEACHER_ADVANCE');
  });
  it('this month, its count and last month per category; the amounts add up to the total', () => {
    const rows = buildCategoryRows(thisMonth, lastMonth, true);
    expect(rows.find((r) => r.category === 'OTHER')).toEqual({
      category: 'OTHER',
      amount: 200_000,
      count: 2,
      lastMonthAmount: 0,
      notRecorded: false,
    });
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(
      summarize(thisMonth).total,
    );
  });
  it('«yozilmagan» only in the current month, only for rent, utilities and tax at 0 with last month above 0', () => {
    const current = buildCategoryRows(thisMonth, lastMonth, true);
    expect(current.filter((r) => r.notRecorded).map((r) => r.category)).toEqual(
      ['UTILITIES'],
    );
    expect(current.find((r) => r.category === 'SUPPLIES')?.notRecorded).toBe(
      false,
    );
    expect(
      buildCategoryRows(thisMonth, lastMonth, false).some((r) => r.notRecorded),
    ).toBe(false);
  });
});

describe('missingByBranch (spec B6 §4.3)', () => {
  const names = new Map([
    [1, 'Markaz'],
    [2, 'Shimol'],
  ]);
  const simple = (rows: MonthExpenseRow[]) =>
    rows.map((r) => ({
      category: r.category,
      description: r.description,
      amount: r.amount,
      dateStr: tashkentDateStr(r.date),
    }));

  it('one branch: exactly the Foyda forecast rule', () => {
    const last = [
      row({ day: '2026-09-28', category: 'RENT', amount: 5_000_000 }),
      row({ day: '2026-09-29', category: 'UTILITIES', amount: 4_700_000 }),
      row({
        day: '2026-09-30',
        category: 'OTHER',
        description: 'Soliqlar',
        amount: 1_200_000,
      }),
    ];
    const now = [
      row({ day: '2026-10-05', category: 'UTILITIES', amount: 70_000 }),
    ];
    expect(
      missingByBranch(last, now, names).map(
        ({ key, amount, lastMonthAmount }) => ({
          key,
          amount,
          lastMonthAmount,
        }),
      ),
    ).toEqual(
      missingRecurringExpenses(simple(last), simple(now)).map(
        ({ key, amount, lastMonthAmount }) => ({
          key,
          amount,
          lastMonthAmount,
        }),
      ),
    );
  });
  it('two branches: one over, one short — the short one shows', () => {
    const last = [
      row({
        day: '2026-09-28',
        category: 'RENT',
        amount: 5_000_000,
        branchId: 1,
      }),
      row({
        day: '2026-09-28',
        category: 'RENT',
        amount: 3_000_000,
        branchId: 2,
      }),
    ];
    const now = [
      row({
        day: '2026-10-02',
        category: 'RENT',
        amount: 6_000_000,
        branchId: 1,
      }),
    ];
    expect(missingByBranch(last, now, names)).toEqual([
      {
        key: 'RENT',
        branchId: 2,
        branchName: 'Shimol',
        amount: 3_000_000,
        lastMonthAmount: 3_000_000,
        thisMonthAmount: 0,
      },
    ]);
  });
  it('OTHER with «soliq» in the description is tax; part recorded leaves the rest', () => {
    const last = [
      row({
        day: '2026-09-30',
        category: 'OTHER',
        description: 'Soliqlar',
        amount: 1_200_000,
      }),
      row({ day: '2026-09-29', category: 'UTILITIES', amount: 4_700_000 }),
    ];
    const now = [
      row({ day: '2026-10-05', category: 'UTILITIES', amount: 70_000 }),
    ];
    expect(missingByBranch(last, now, names)).toEqual([
      {
        key: 'TAXES',
        branchId: 1,
        branchName: 'Markaz',
        amount: 1_200_000,
        lastMonthAmount: 1_200_000,
        thisMonthAmount: 0,
      },
      {
        key: 'UTILITIES',
        branchId: 1,
        branchName: 'Markaz',
        amount: 4_630_000,
        lastMonthAmount: 4_700_000,
        thisMonthAmount: 70_000,
      },
    ]);
  });
  it('branches by name', () => {
    const last = [
      row({ day: '2026-09-28', category: 'RENT', amount: 1, branchId: 2 }),
      row({ day: '2026-09-28', category: 'RENT', amount: 1, branchId: 1 }),
    ];
    expect(missingByBranch(last, [], names).map((m) => m.branchName)).toEqual([
      'Markaz',
      'Shimol',
    ]);
  });
});

describe('emptyBranches (spec B6 §4.3)', () => {
  it('a live ACTIVE branch with no expense this month; never an inactive or deleted one', () => {
    const branches = [
      { id: 1, name: 'Markaz', status: 'ACTIVE', deletedAt: null },
      { id: 2, name: 'Shimol', status: 'ACTIVE', deletedAt: null },
      { id: 3, name: 'Janub', status: 'INACTIVE', deletedAt: null },
      {
        id: 4,
        name: 'Sharq',
        status: 'ACTIVE',
        deletedAt: new Date('2026-09-01T00:00:00Z'),
      },
    ];
    expect(
      emptyBranches(branches, [
        row({ day: '2026-10-02', branchId: 1, amount: 1 }),
      ]),
    ).toEqual([{ id: 2, name: 'Shimol' }]);
  });
});
