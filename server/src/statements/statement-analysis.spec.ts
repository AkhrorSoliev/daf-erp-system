import { allocate } from './statement-analysis';
import type {
  StatementItem,
  StatementMonth,
  StatementRow,
} from './statement.types';

// Made-up figures only.
const month = (
  key: string,
  cost: number,
  items: StatementItem[] = [],
): StatementMonth => ({
  key,
  lessons: 0,
  absent: 0,
  cost,
  paid: 0,
  items,
  money: 0,
  running: 0,
  preSystem: null,
  packParts: [],
  monthlyParts: [],
  notes: [],
  lessonDays: [],
  model: null,
  sharp: null,
});
const pay = (day: string, amount: number): StatementRow => ({
  id: `p-${day}`,
  type: 'PAYMENT',
  amount,
  day,
  at: `${day}T05:00:00.000Z`,
  description: null,
  metadata: null,
  enrollmentId: null,
  paymentId: `p-${day}`,
  paymentMethod: 'CASH',
  reversed: false,
  reversal: false,
  consumedDays: null,
});
const owed = (r: ReturnType<typeof allocate>) =>
  r.unpaid.reduce((s, u) => s + u.amount, 0);

describe('allocate', () => {
  it('spends a negative month as a credit, so the unpaid lines add up to the debt', () => {
    // Balance: 500 000 paid − (400 000 − 100 000 + 400 000) = −200 000.
    const r = allocate(
      [
        month('2026-03', 400_000),
        month('2026-04', -100_000),
        month('2026-05', 400_000),
      ],
      [pay('2026-03-10', 500_000)],
      0,
    );
    expect(r.unpaid).toEqual([
      { due: { kind: 'month', month: '2026-05' }, amount: 200_000 },
    ]);
    expect(r.allocations[1]).toMatchObject({
      kind: 'credit',
      itemKind: null,
      month: '2026-04',
      day: '2026-04-01',
      amount: 100_000,
      to: [{ due: { kind: 'month', month: '2026-05' }, amount: 100_000 }],
      leftover: 0,
    });
  });

  it('lets a negative month pay an older month first, like any payment', () => {
    // Balance: 50 000 − (300 000 − 80 000 + 200 000) = −370 000.
    const r = allocate(
      [
        month('2026-03', 300_000),
        month('2026-04', 200_000),
        month('2026-05', -80_000),
      ],
      [pay('2026-05-20', 50_000)],
      0,
    );
    expect(r.unpaid).toEqual([
      { due: { kind: 'month', month: '2026-04' }, amount: 200_000 },
      { due: { kind: 'month', month: '2026-03' }, amount: 170_000 },
    ]);
    expect(owed(r)).toBe(370_000);
  });

  it('pays a refund item from a negative month too', () => {
    // Balance: −(200 000 − 90 000) − 60 000 = −170 000.
    const r = allocate(
      [
        month('2026-03', 200_000),
        month('2026-04', -90_000, [
          {
            day: '2026-04-15',
            kind: 'refund',
            amount: -60_000,
            description: null,
          },
        ]),
      ],
      [],
      0,
    );
    expect(owed(r)).toBe(170_000);
  });

  it('keeps what a negative month cannot spend as leftover, owing nothing', () => {
    // Balance: 100 000 − (100 000 − 30 000) = +30 000.
    const r = allocate(
      [month('2026-03', 100_000), month('2026-04', -30_000)],
      [pay('2026-03-05', 100_000)],
      0,
    );
    expect(r.unpaid).toEqual([]);
    expect(r.allocations.map((a) => [a.month, a.leftover])).toEqual([
      [null, 0],
      ['2026-04', 30_000],
    ]);
  });
});
