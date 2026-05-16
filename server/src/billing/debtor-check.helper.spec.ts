import {
  calculateDebtAmount,
  calculatePerLessonCost,
  isStudentDebtorForGroup,
} from './debtor-check.helper';

describe('debtor-check helper', () => {
  describe('calculatePerLessonCost', () => {
    it('rounds 400000 / 12 to 33333', () => {
      expect(calculatePerLessonCost(400000, 12)).toBe(33333);
    });

    it('rounds 690000 / 20 to 34500', () => {
      expect(calculatePerLessonCost(690000, 20)).toBe(34500);
    });

    it('falls back to default count (12) when lessonPaymentCount is null/0', () => {
      expect(calculatePerLessonCost(120000, null)).toBe(10000);
      expect(calculatePerLessonCost(120000, 0)).toBe(10000);
      expect(calculatePerLessonCost(120000, undefined)).toBe(10000);
    });

    it('handles zero price', () => {
      expect(calculatePerLessonCost(0, 12)).toBe(0);
    });
  });

  describe('isStudentDebtorForGroup', () => {
    it('positive balance is NOT a debtor (even when below perLessonCost)', () => {
      // The billing layer now deducts on every attended lesson, so a
      // low-but-positive balance is no longer a "needs to pay" signal.
      expect(isStudentDebtorForGroup(10_000, 400_000, 12)).toBe(false);
    });

    it('zero balance is NOT a debtor (no actual debt yet)', () => {
      expect(isStudentDebtorForGroup(0, 400_000, 12)).toBe(false);
    });

    it('negative balance IS a debtor (real accumulated debt)', () => {
      expect(isStudentDebtorForGroup(-50_000, 400_000, 12)).toBe(true);
    });

    it('zero-price course: zero balance is not a debtor', () => {
      expect(isStudentDebtorForGroup(0, 0, 12)).toBe(false);
    });

    it('large positive balance is not a debtor', () => {
      expect(isStudentDebtorForGroup(1_000_000, 400_000, 12)).toBe(false);
    });
  });

  describe('calculateDebtAmount', () => {
    it('returns 0 when balance is positive', () => {
      expect(calculateDebtAmount(10_000, 400_000, 12)).toBe(0);
    });

    it('returns 0 when balance is exactly zero', () => {
      expect(calculateDebtAmount(0, 400_000, 12)).toBe(0);
    });

    it('returns the absolute value of a negative balance', () => {
      // -150,000 balance = 150,000 so'm of debt.
      expect(calculateDebtAmount(-150_000, 400_000, 12)).toBe(150_000);
    });

    it('handles large debt', () => {
      expect(calculateDebtAmount(-1_000_000, 400_000, 12)).toBe(1_000_000);
    });
  });
});
