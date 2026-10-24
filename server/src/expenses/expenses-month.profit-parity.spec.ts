import type { PrismaService } from '../prisma/prisma.service';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import {
  addDaysToDateStr,
  addMonthsToMonthKey,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { ReportsProfitLossService } from '../reports/reports-profit-loss.service';
import { buildNetProfit } from '../reports/reports-excel.helpers';
import { ExpensesMonthService } from './expenses-month.service';

/**
 * Spec B6 §4.2 / §8: the page's month total is the canonical net profit's
 * `operatingExpenses` for the same month and scope. Both services run over
 * the same in-memory rows through a tiny Prisma stand-in that understands
 * exactly the predicates they send (an unknown one throws, so a new filter
 * cannot pass silently).
 */
interface Row {
  companyId: number;
  branchId: number;
  category: string;
  amount: number;
  paymentMethod: 'CASH' | 'CARD';
  description: string;
  date: Date;
  deletedAt: Date | null;
  createdById: number;
}

function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const value = (row as unknown as Record<string, unknown>)[key];
    if (key === 'date') {
      const t = (value as Date).getTime();
      const c = cond as { gte?: Date; lte?: Date; lt?: Date };
      if (c.gte && t < c.gte.getTime()) return false;
      if (c.lte && t > c.lte.getTime()) return false;
      if (c.lt && t >= c.lt.getTime()) return false;
      continue;
    }
    if (cond !== null && typeof cond === 'object') {
      const c = cond as { in?: unknown[]; not?: unknown };
      const known = Object.keys(c).every((k) => k === 'in' || k === 'not');
      if (!known) throw new Error(`fake prisma: unsupported filter on ${key}`);
      if (c.in && !c.in.includes(value)) return false;
      if ('not' in c && value === c.not) return false;
      continue;
    }
    if (value !== cond) return false;
  }
  return true;
}

function fakePrisma(rows: Row[]) {
  return {
    expense: {
      findMany: ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(rows.filter((r) => matches(r, where))),
      groupBy: ({ where }: { where: Record<string, unknown> }) => {
        const sums = new Map<string, number>();
        for (const r of rows.filter((x) => matches(x, where)))
          sums.set(r.category, (sums.get(r.category) ?? 0) + r.amount);
        return Promise.resolve(
          [...sums].map(([category, amount]) => ({
            category,
            _sum: { amount },
          })),
        );
      },
    },
    payment: { groupBy: () => Promise.resolve([]) },
    salaryPayment: { findMany: () => Promise.resolve([]) },
    branch: { findMany: () => Promise.resolve([]) },
    user: { findMany: () => Promise.resolve([]) },
  } as unknown as PrismaService;
}

const NOW = new Date('2026-10-20T07:00:00Z');
const lastDay = (month: string) =>
  addDaysToDateStr(`${addMonthsToMonthKey(month, 1)}-01`, -1);

async function both(rows: Row[], month: string, branchIds: ReportBranchIds) {
  const prisma = fakePrisma(rows);
  const page = await new ExpensesMonthService(prisma).monthSummary(
    1,
    branchIds,
    month,
    NOW,
  );
  const pl = await new ReportsProfitLossService(prisma).getProfitLoss(1, {
    branchIds,
    startDate: `${month}-01`,
    endDate: lastDay(month),
  });
  return {
    page: page.total,
    canonical: buildNetProfit(pl, null, null, month, 0).operatingExpenses,
  };
}

const base = (o: Partial<Row> & { day: string }): Row => {
  const { day, ...rest } = o;
  return {
    companyId: 1,
    branchId: 1,
    category: 'OTHER',
    amount: 0,
    paymentMethod: 'CASH',
    description: '',
    deletedAt: null,
    createdById: 10001,
    ...rest,
    date: utcMidnightFromDateStr(day),
  };
};

describe('month total === canonical operatingExpenses (spec B6 §4.2)', () => {
  // Every edge at once: the day before, the first and last day, the day after,
  // an advance, a deleted row, another branch, another company.
  const EDGES: Row[] = [
    base({ day: '2026-09-30', category: 'RENT', amount: 5_000_000 }),
    base({ day: '2026-10-01', category: 'UTILITIES', amount: 700_000 }),
    base({ day: '2026-10-31', category: 'OTHER', amount: 300_000 }),
    base({ day: '2026-11-01', category: 'MARKETING', amount: 400_000 }),
    base({ day: '2026-10-10', category: 'TEACHER_ADVANCE', amount: 1_000_000 }),
    base({
      day: '2026-10-12',
      category: 'SUPPLIES',
      amount: 200_000,
      deletedAt: new Date('2026-10-13T08:00:00Z'),
    }),
    base({
      day: '2026-10-15',
      category: 'EQUIPMENT',
      amount: 900_000,
      branchId: 2,
    }),
    base({
      day: '2026-10-15',
      category: 'TAXES',
      amount: 600_000,
      companyId: 2,
    }),
  ];

  it('the edges, branch 1: 1 000 000 on both sides', async () => {
    expect(await both(EDGES, '2026-10', [1])).toEqual({
      page: 1_000_000,
      canonical: 1_000_000,
    });
  });
  it('the edges, every branch: 1 900 000 on both sides', async () => {
    expect(await both(EDGES, '2026-10', null)).toEqual({
      page: 1_900_000,
      canonical: 1_900_000,
    });
  });

  function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }
  const CATEGORIES = [
    'RENT',
    'UTILITIES',
    'SUPPLIES',
    'MARKETING',
    'TEACHER_ADVANCE',
    'EQUIPMENT',
    'MAINTENANCE',
    'TAXES',
    'OTHER',
  ];
  const DAYS = [
    '2026-08-31',
    '2026-09-01',
    '2026-09-15',
    '2026-09-30',
    '2026-10-01',
    '2026-10-16',
    '2026-10-31',
    '2026-11-01',
  ];
  function randomRows(seed: number): Row[] {
    const r = rng(seed);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
    return Array.from({ length: 40 }, () =>
      base({
        day: pick(DAYS),
        companyId: r() < 0.9 ? 1 : 2,
        branchId: pick([1, 2, 3]),
        category: pick(CATEGORIES),
        amount: 1 + Math.floor(r() * 2_000_000),
        paymentMethod: r() < 0.5 ? 'CASH' : 'CARD',
        description: pick(['Ijara', 'Soliqlar', 'Stul', 'Internet']),
        deletedAt: r() < 0.1 ? new Date('2026-10-02T10:00:00Z') : null,
      }),
    );
  }

  it.each<[string, ReportBranchIds]>([
    ['every branch', null],
    ['branch 1', [1]],
    ['branches 1 and 2', [1, 2]],
  ])("random months (%s): equal to the so'm", async (_name, branchIds) => {
    for (let seed = 1; seed <= 100; seed++) {
      const rows = randomRows(seed);
      for (const month of ['2026-09', '2026-10']) {
        const { page, canonical } = await both(rows, month, branchIds);
        expect({ seed, month, total: page }).toEqual({
          seed,
          month,
          total: canonical,
        });
      }
    }
  });
});
