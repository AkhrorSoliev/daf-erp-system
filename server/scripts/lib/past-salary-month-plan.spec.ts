import { payDayAfter, planPastMonthPayment } from './past-salary-month-plan';

describe('past salary month plan (CEO rules of 27.09.2026)', () => {
  const accounts = {
    cashAccountId: 'kassa',
    bankAccountId: 'bank',
    // The branch's first cash movement, mid-June.
    journalStart: new Date('2026-06-15T04:00:00.000Z'),
  };
  // 10.07.2026 00:00 Tashkent
  const july10 = new Date('2026-07-09T19:00:00.000Z');
  // 10.06.2026 00:00 Tashkent
  const june10 = new Date('2026-06-09T19:00:00.000Z');

  describe('payDayAfter', () => {
    it('puts a month on the pay day of the following month', () => {
      expect(payDayAfter('2026-05', 10)).toBe('2026-06-10');
      expect(payDayAfter('2026-08', 10)).toBe('2026-09-10');
    });

    it('rolls December into the next year', () => {
      expect(payDayAfter('2026-12', 5)).toBe('2027-01-05');
    });
  });

  describe('planPastMonthPayment', () => {
    it("splits a teacher's payout half cash, half card", () => {
      expect(
        planPastMonthPayment(
          { paymentId: 'p', amount: 1_000_000, staff: false },
          accounts,
          july10,
        ),
      ).toEqual({
        paymentId: 'p',
        cashSlices: [
          { cashAccountId: 'kassa', amount: 500_000 },
          { cashAccountId: 'bank', amount: 500_000 },
        ],
      });
    });

    it("gives the odd so'm to cash, and the parts always add up", () => {
      const plan = planPastMonthPayment(
        { paymentId: 'p', amount: 1_234_567, staff: false },
        accounts,
        july10,
      );
      expect(plan.cashSlices).toEqual([
        { cashAccountId: 'kassa', amount: 617_284 },
        { cashAccountId: 'bank', amount: 617_283 },
      ]);
      expect(plan.cashSlices!.reduce((s, x) => s + x.amount, 0)).toBe(
        1_234_567,
      );
    });

    it('pays staff all cash', () => {
      expect(
        planPastMonthPayment(
          { paymentId: 'p', amount: 3_000_000, staff: true },
          accounts,
          july10,
        ),
      ).toEqual({
        paymentId: 'p',
        cashSlices: [{ cashAccountId: 'kassa', amount: 3_000_000 }],
      });
    });

    it('records a month paid before the cash journal without any movement', () => {
      expect(
        planPastMonthPayment(
          { paymentId: 'p', amount: 1_000_000, staff: false },
          accounts,
          june10,
        ),
      ).toEqual({ paymentId: 'p', predatesCashJournal: true });
    });

    it('treats a branch that never had a movement as having no journal yet', () => {
      expect(
        planPastMonthPayment(
          { paymentId: 'p', amount: 1_000_000, staff: true },
          { ...accounts, journalStart: null },
          july10,
        ),
      ).toEqual({ paymentId: 'p', predatesCashJournal: true });
    });

    it("names no account for a zero payout or a one-so'm card part", () => {
      expect(
        planPastMonthPayment(
          { paymentId: 'p', amount: 0, staff: false },
          accounts,
          july10,
        ).cashSlices,
      ).toEqual([]);
      expect(
        planPastMonthPayment(
          { paymentId: 'p', amount: 1, staff: false },
          accounts,
          july10,
        ).cashSlices,
      ).toEqual([{ cashAccountId: 'kassa', amount: 1 }]);
    });
  });
});
