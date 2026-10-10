import {
  addBankDays,
  bankDaysBetween,
  isBankDay,
  REFUND_TERM_BANK_DAYS,
} from './bank-days';

const none = new Set<string>();

describe('bank days (ADR-0077)', () => {
  it('Saturday, Sunday and a holiday are not bank days', () => {
    expect(isBankDay('2026-10-10', none)).toBe(false); // Saturday
    expect(isBankDay('2026-10-11', none)).toBe(false); // Sunday
    expect(isBankDay('2026-10-12', none)).toBe(true); // Monday
    expect(isBankDay('2026-10-01', new Set(['2026-10-01']))).toBe(false);
  });

  describe('addBankDays', () => {
    it('counts from the day after, skipping the weekend', () => {
      expect(addBankDays('2026-10-09', 1, none)).toBe('2026-10-12'); // Fri → Mon
      expect(addBankDays('2026-10-02', 2, none)).toBe('2026-10-06');
    });

    it('a request on Friday or Saturday is due on the Friday two weeks on', () => {
      expect(addBankDays('2026-10-09', REFUND_TERM_BANK_DAYS, none)).toBe(
        '2026-10-23',
      );
      expect(addBankDays('2026-10-10', REFUND_TERM_BANK_DAYS, none)).toBe(
        '2026-10-23',
      );
    });

    it('a holiday inside the term pushes it by a day (spec §2.6)', () => {
      // Monday 28.09.2026, Thursday 01.10 a holiday → Tuesday 13.10.
      expect(addBankDays('2026-09-28', 10, new Set(['2026-10-01']))).toBe(
        '2026-10-13',
      );
    });

    it('zero bank days is the day itself', () => {
      expect(addBankDays('2026-10-10', 0, none)).toBe('2026-10-10');
    });
  });

  describe('bankDaysBetween', () => {
    it('counts the bank days after the first day, up to and including the second', () => {
      expect(bankDaysBetween('2026-10-10', '2026-10-13', none)).toBe(2);
      expect(bankDaysBetween('2026-10-10', '2026-10-23', none)).toBe(10);
      expect(
        bankDaysBetween('2026-09-28', '2026-10-13', new Set(['2026-10-01'])),
      ).toBe(10);
    });

    it('is negative when the second day is earlier, zero on the same day', () => {
      expect(bankDaysBetween('2026-10-10', '2026-10-07', none)).toBe(-2);
      expect(bankDaysBetween('2026-10-12', '2026-10-12', none)).toBe(0);
    });
  });
});
