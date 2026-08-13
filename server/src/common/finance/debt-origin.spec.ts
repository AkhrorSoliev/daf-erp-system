import { TransactionType } from '@prisma/client';
import { replayDebtOrigin, wholeMonthsBetween } from './debt-origin';

/**
 * The rule both the debt-history aging columns and the debtors list read from.
 * Its two answers — since when, and from which months — have to come out of one
 * walk, or the same student can be described two ways on one page.
 */
describe('replayDebtOrigin', () => {
  const row = (
    amount: number,
    iso: string,
    type: TransactionType = TransactionType.LESSON_DEDUCTION,
  ) => ({ amount, createdAt: new Date(iso), type });

  it('reports nothing for a student who owes nothing', () => {
    const r = replayDebtOrigin([
      row(500_000, '2026-05-02T09:00:00Z', TransactionType.PAYMENT),
      row(-200_000, '2026-05-10T09:00:00Z'),
    ]);
    expect(r.since).toBeNull();
    expect([...r.byMonth]).toEqual([]);
  });

  it('labels debt by the month the uncovered charge landed in', () => {
    const r = replayDebtOrigin([
      row(-100_000, '2026-05-10T09:00:00Z'),
      row(-50_000, '2026-06-10T09:00:00Z'),
    ]);
    expect([...r.byMonth]).toEqual([
      ['2026-05', 100_000],
      ['2026-06', 50_000],
    ]);
    expect(r.since).toEqual(new Date('2026-05-10T09:00:00Z'));
  });

  it('settles a payment against the OLDEST month first', () => {
    const r = replayDebtOrigin([
      row(-100_000, '2026-05-10T09:00:00Z'),
      row(-100_000, '2026-06-10T09:00:00Z'),
      row(120_000, '2026-07-01T09:00:00Z', TransactionType.PAYMENT),
    ]);
    // May is cleared, June keeps the remainder — never the other way round.
    expect([...r.byMonth]).toEqual([['2026-06', 80_000]]);
  });

  it('restarts the streak when the balance climbs back to zero', () => {
    const r = replayDebtOrigin([
      row(-100_000, '2026-05-10T09:00:00Z'),
      row(100_000, '2026-06-01T09:00:00Z', TransactionType.PAYMENT),
      row(-70_000, '2026-08-05T09:00:00Z'),
    ]);
    // Owed since August, not since May — the hole was filled in between.
    expect(r.since).toEqual(new Date('2026-08-05T09:00:00Z'));
    expect([...r.byMonth]).toEqual([['2026-08', 70_000]]);
  });

  it('lets a prepaid balance absorb a charge before it becomes debt', () => {
    const r = replayDebtOrigin([
      row(300_000, '2026-05-01T09:00:00Z', TransactionType.PAYMENT),
      row(-100_000, '2026-05-10T09:00:00Z'),
      row(-100_000, '2026-06-10T09:00:00Z'),
      row(-200_000, '2026-07-10T09:00:00Z'),
    ]);
    // Only the part beyond the 300 000 already paid is debt, and it belongs
    // to July — the month the money actually ran out.
    expect([...r.byMonth]).toEqual([['2026-07', 100_000]]);
    expect(r.since).toEqual(new Date('2026-07-10T09:00:00Z'));
  });

  it('sums the buckets to exactly the live debt', () => {
    const r = replayDebtOrigin([
      row(-100_000, '2026-05-10T09:00:00Z'),
      row(-100_000, '2026-06-10T09:00:00Z'),
      row(-100_000, '2026-07-10T09:00:00Z'),
      row(150_000, '2026-07-20T09:00:00Z', TransactionType.PAYMENT),
    ]);
    const total = [...r.byMonth.values()].reduce((s, x) => s + x, 0);
    expect(total).toBe(150_000);
  });

  it('counts a write-off as debt relief like any other credit', () => {
    const r = replayDebtOrigin([
      row(-100_000, '2026-05-10T09:00:00Z'),
      row(100_000, '2026-06-01T09:00:00Z', TransactionType.DEBT_WRITE_OFF),
    ]);
    expect(r.since).toBeNull();
    expect([...r.byMonth]).toEqual([]);
  });
});

describe('wholeMonthsBetween', () => {
  it('counts only completed months', () => {
    expect(
      wholeMonthsBetween(new Date('2026-05-10'), new Date('2026-08-09')),
    ).toBe(2);
    expect(
      wholeMonthsBetween(new Date('2026-05-10'), new Date('2026-08-11')),
    ).toBe(3);
  });

  it('never goes negative', () => {
    expect(
      wholeMonthsBetween(new Date('2026-08-10'), new Date('2026-05-10')),
    ).toBe(0);
  });
});
