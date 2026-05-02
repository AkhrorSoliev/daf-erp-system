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
    it('balance equal to perLessonCost is NOT a debtor (boundary)', () => {
      // 33,333 covers exactly one 33,333 lesson — student can attend.
      expect(isStudentDebtorForGroup(33333, 400000, 12)).toBe(false);
    });

    it('balance one som below perLessonCost IS a debtor', () => {
      expect(isStudentDebtorForGroup(33332, 400000, 12)).toBe(true);
    });

    it('zero balance is a debtor when course has price', () => {
      expect(isStudentDebtorForGroup(0, 400000, 12)).toBe(true);
    });

    it('large balance is not a debtor', () => {
      expect(isStudentDebtorForGroup(1_000_000, 400000, 12)).toBe(false);
    });

    it('negative balance is a debtor', () => {
      expect(isStudentDebtorForGroup(-50000, 400000, 12)).toBe(true);
    });

    it('zero-price course: even zero balance is not a debtor', () => {
      // perLessonCost = 0, so any balance >= 0 covers it.
      expect(isStudentDebtorForGroup(0, 0, 12)).toBe(false);
    });
  });

  describe('calculateDebtAmount', () => {
    it('returns the gap when balance is below perLessonCost', () => {
      // perLessonCost = 33,333; balance = 10,000 → debt = 23,333
      expect(calculateDebtAmount(10_000, 400_000, 12)).toBe(23333);
    });

    it('returns 0 when balance covers the lesson exactly', () => {
      expect(calculateDebtAmount(33333, 400_000, 12)).toBe(0);
    });

    it('returns 0 (never negative) when balance exceeds perLessonCost', () => {
      expect(calculateDebtAmount(500_000, 400_000, 12)).toBe(0);
    });

    it('handles negative balance correctly (debt = perLessonCost + |balance|)', () => {
      // perLessonCost = 33,333; balance = -10,000 → debt = 43,333
      expect(calculateDebtAmount(-10_000, 400_000, 12)).toBe(43333);
    });
  });
});
