import {
  isTopUpMonth,
  monthKeyOf,
  NEW_STUDENT_TOPUP_MIN_LESSONS,
  topUpEraStartDate,
  TOPUP_EFFECTIVE_MONTH,
} from './topup';

/**
 * The top-up era gate (2026-07) and the BR-09 new-student threshold.
 * Pure functions — no DB, no mocks.
 */
describe('salary/shared/topup', () => {
  describe('topUpEraStartDate', () => {
    it('is the UTC-midnight first day of the top-up era', () => {
      expect(topUpEraStartDate().toISOString()).toBe(
        '2026-07-01T00:00:00.000Z',
      );
    });
  });

  describe('constants + month keys', () => {
    it('sets the new-student top-up threshold to 4 lessons', () => {
      expect(NEW_STUDENT_TOPUP_MIN_LESSONS).toBe(4);
    });

    it('anchors the top-up era on 2026-07', () => {
      expect(TOPUP_EFFECTIVE_MONTH).toBe('2026-07');
      expect(isTopUpMonth('2026-06')).toBe(false);
      expect(isTopUpMonth('2026-07')).toBe(true);
      expect(monthKeyOf(new Date('2026-07-01T00:00:00Z'))).toBe('2026-07');
    });
  });
});
