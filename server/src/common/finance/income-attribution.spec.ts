import { TransactionType } from '@prisma/client';
import { resolvePeriod } from './period-helpers';
import {
  attributeIncome,
  AttributionRow,
  loadAttributionRows,
} from './income-attribution';

const OCT = resolvePeriod('2026-10-01', '2026-10-31');
const WEEK = resolvePeriod('2026-10-05', '2026-10-11');
const debit = (
  studentId: number,
  amount: number,
  iso: string,
): AttributionRow => ({
  studentId,
  type: TransactionType.LESSON_DEDUCTION,
  amount: -amount,
  branchId: 1,
  createdAt: new Date(iso),
  paymentId: null,
});
const pay = (
  studentId: number,
  paymentId: string | null,
  amount: number,
  iso: string,
  branchId = 1,
): AttributionRow => ({
  studentId,
  type: TransactionType.PAYMENT,
  amount,
  branchId,
  createdAt: new Date(iso),
  paymentId,
});

// Oct 1 01:00 Tashkent = 2026-09-30T20:00Z; Nov 1 00:30 Tashkent = 2026-10-31T19:30Z.
const S1 = [
  debit(1, 150_000, '2026-09-02T05:00:00Z'),
  debit(1, 385_714, '2026-09-30T20:00:00Z'),
  pay(1, 'p1', 535_714, '2026-10-10T10:00:00Z'),
];
const S2 = [
  pay(2, 'p2', 350_000, '2026-10-05T06:00:00Z'),
  debit(2, 250_000, '2026-10-15T06:00:00Z'),
];
const S3 = [
  pay(3, 'p3', 400_000, '2026-10-20T06:00:00Z'),
  debit(3, 400_000, '2026-10-31T19:30:00Z'),
];
const S4 = [
  pay(4, 'p4a', 100_000, '2026-10-02T06:00:00Z'),
  pay(4, 'p4b', 100_000, '2026-10-03T06:00:00Z'),
  debit(4, 150_000, '2026-10-04T06:00:00Z'),
];

describe('attributeIncome', () => {
  it('splits a payment into an old month debt and this month', () => {
    const a = attributeIncome(S1, OCT, null);
    expect(a.byPayment.get('p1')).toEqual({
      currentMonth: 385_714,
      advance: 0,
      late: [{ monthKey: '2026-09', amount: 150_000 }],
    });
    expect(a.lateByMonth.get('2026-09')).toBe(150_000);
  });

  it('moves the part a debit inside the period spent from advance to this month', () => {
    expect(attributeIncome(S2, OCT, null).byPayment.get('p2')).toEqual({
      currentMonth: 250_000,
      advance: 100_000,
      late: [],
    });
  });

  it('keeps money a debit after the period end spent as advance', () => {
    expect(attributeIncome(S3, OCT, null).byPayment.get('p3')).toEqual({
      currentMonth: 0,
      advance: 400_000,
      late: [],
    });
  });

  it('a shorter period reads the same payment as advance (relative to the period end)', () => {
    expect(attributeIncome(S2, WEEK, null).byPayment.get('p2')).toEqual({
      currentMonth: 0,
      advance: 350_000,
      late: [],
    });
  });

  it('a debit spends the oldest payment first', () => {
    const a = attributeIncome(S4, OCT, null);
    expect(a.byPayment.get('p4a')).toEqual({
      currentMonth: 100_000,
      advance: 0,
      late: [],
    });
    expect(a.byPayment.get('p4b')).toEqual({
      currentMonth: 50_000,
      advance: 50_000,
      late: [],
    });
  });

  it('a payment of another branch ages the debt but has no parts', () => {
    const rows = [
      debit(5, 200_000, '2026-09-10T06:00:00Z'),
      pay(5, 'x', 200_000, '2026-10-02T06:00:00Z', 2),
      pay(5, 'p5', 100_000, '2026-10-03T06:00:00Z'),
    ];
    const a = attributeIncome(rows, OCT, [1]);
    expect(a.byPayment.has('x')).toBe(false);
    expect(a.byPayment.get('p5')).toEqual({
      currentMonth: 0,
      advance: 100_000,
      late: [],
    });
  });

  it('an older out-of-period credit is spent before this period’s advance', () => {
    const rows = [
      pay(6, 'old', 300_000, '2026-09-25T06:00:00Z'),
      pay(6, 'p6', 300_000, '2026-10-02T06:00:00Z'),
      debit(6, 300_000, '2026-10-03T06:00:00Z'),
    ];
    const a = attributeIncome(rows, OCT, null);
    expect(a.byPayment.has('old')).toBe(false);
    expect(a.byPayment.get('p6')).toEqual({
      currentMonth: 0,
      advance: 300_000,
      late: [],
    });
  });

  it('the parts of every payment add up to the period totals', () => {
    const a = attributeIncome([...S1, ...S2, ...S3, ...S4], OCT, null);
    const parts = [...a.byPayment.values()];
    expect(parts.reduce((s, p) => s + p.currentMonth, 0)).toBe(a.currentMonth);
    expect(parts.reduce((s, p) => s + p.advance, 0)).toBe(a.advance);
    expect(
      parts.reduce((s, p) => s + p.late.reduce((x, l) => x + l.amount, 0), 0),
    ).toBe([...a.lateByMonth.values()].reduce((s, v) => s + v, 0));
    expect(a.paymentCount).toBe(5);
  });

  it('a PAYMENT row without paymentId counts in the totals only', () => {
    const a = attributeIncome(
      [pay(7, null, 90_000, '2026-10-02T06:00:00Z')],
      OCT,
      null,
    );
    expect(a.advance).toBe(90_000);
    expect(a.byPayment.size).toBe(0);
  });
});

describe('loadAttributionRows', () => {
  it('reads the effective ledger of the period payers with paymentId', async () => {
    const db = {
      payment: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ studentId: 1 }, { studentId: null }]),
      },
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const r = await loadAttributionRows(db as never, 1001, OCT, [4]);
    expect(r.payerIds).toEqual([1]);
    expect(db.payment.groupBy.mock.calls[0][0].where).toMatchObject({
      companyId: 1001,
      status: 'COMPLETED',
      branchId: { in: [4] },
    });
    const tx = db.transaction.findMany.mock.calls[0][0];
    expect(tx.where).toMatchObject({
      companyId: 1001,
      studentId: { in: [1] },
      reversedAt: null,
      reversedTransactionId: null,
    });
    expect(tx.select.paymentId).toBe(true);
  });

  it('skips the ledger read when nobody paid', async () => {
    const db = {
      payment: { groupBy: jest.fn().mockResolvedValue([]) },
      transaction: { findMany: jest.fn() },
    };
    expect(await loadAttributionRows(db as never, 1001, OCT, null)).toEqual({
      payerIds: [],
      rows: [],
    });
    expect(db.transaction.findMany).not.toHaveBeenCalled();
  });
});
