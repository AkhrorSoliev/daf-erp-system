import {
  absentExcludedFromSalary,
  isTopUpMonth,
  monthKeyOf,
  NEW_STUDENT_TOPUP_MIN_LESSONS,
  TOPUP_EFFECTIVE_MONTH,
} from './topup';

/**
 * BR-06/08/11 gate (ABSENT earns the teacher nothing from the top-up era) and
 * the BR-09 new-student threshold. Pure functions — no DB, no mocks.
 */
describe('salary/shared/topup', () => {
  describe('absentExcludedFromSalary', () => {
    it('excludes an ABSENT lesson held in the top-up era (July 2026+)', () => {
      expect(absentExcludedFromSalary('ABSENT', new Date('2026-07-10'))).toBe(true);
      expect(absentExcludedFromSalary('ABSENT', new Date('2026-08-01'))).toBe(true);
    });

    it('includes ABSENT exactly on the effective boundary (01.07.2026)', () => {
      // @db.Date values are UTC midnight; monthKeyOf applies the Tashkent offset.
      expect(absentExcludedFromSalary('ABSENT', new Date('2026-07-01T00:00:00Z'))).toBe(true);
    });

    it('does NOT exclude a pre-July ABSENT lesson (BR-12 — May/June late pay reaches the teacher)', () => {
      expect(absentExcludedFromSalary('ABSENT', new Date('2026-06-15'))).toBe(false);
      expect(absentExcludedFromSalary('ABSENT', new Date('2026-05-31'))).toBe(false);
    });

    it('never excludes PRESENT/LATE/EXCUSED, even in the top-up era', () => {
      const july = new Date('2026-07-10');
      expect(absentExcludedFromSalary('PRESENT', july)).toBe(false);
      expect(absentExcludedFromSalary('LATE', july)).toBe(false);
      expect(absentExcludedFromSalary('EXCUSED', july)).toBe(false);
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
