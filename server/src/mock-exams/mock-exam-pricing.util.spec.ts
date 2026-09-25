import { StudentStatus } from '@prisma/client';
import {
  CEFR_LEVELS,
  isCefrLevel,
  resolveParticipantFee,
  sanitizeExamTimes,
  sanitizeOfferedLevels,
} from './mock-exam-pricing.util';

describe('mock-exam-pricing.util', () => {
  describe('resolveParticipantFee', () => {
    const exam = { price: 100000, studentPrice: 50000 };
    const student = (status: StudentStatus) => ({ status });

    it('charges the full price for a non-DaF (outsider) registrant', () => {
      expect(resolveParticipantFee(exam, null)).toBe(100000);
    });

    it('charges the discounted studentPrice for a DaF student', () => {
      expect(resolveParticipantFee(exam, student(StudentStatus.ACTIVE))).toBe(
        50000,
      );
    });

    it.each([
      StudentStatus.ACTIVE,
      StudentStatus.INACTIVE,
      StudentStatus.FROZEN,
      StudentStatus.GRADUATED,
      StudentStatus.PROSPECT,
    ])('gives the discount to a %s student', (status) => {
      expect(resolveParticipantFee(exam, student(status))).toBe(50000);
    });

    /** CEO, 2026-09-25: expelled and archived students get no discount. */
    it.each([StudentStatus.EXPELLED, StudentStatus.ARCHIVED])(
      'charges a %s student the full price',
      (status) => {
        expect(resolveParticipantFee(exam, student(status))).toBe(100000);
      },
    );

    it('falls back to full price for a DaF student when no discount is set', () => {
      const active = student(StudentStatus.ACTIVE);
      expect(resolveParticipantFee({ price: 100000 }, active)).toBe(100000);
      expect(
        resolveParticipantFee({ price: 100000, studentPrice: null }, active),
      ).toBe(100000);
    });

    it('respects a studentPrice of 0 (free for DaF students)', () => {
      expect(
        resolveParticipantFee(
          { price: 100000, studentPrice: 0 },
          student(StudentStatus.ACTIVE),
        ),
      ).toBe(0);
    });
  });

  describe('isCefrLevel', () => {
    it('accepts valid CEFR codes', () => {
      for (const lvl of CEFR_LEVELS) {
        expect(isCefrLevel(lvl)).toBe(true);
      }
    });

    it('rejects anything else', () => {
      expect(isCefrLevel('A0')).toBe(false);
      expect(isCefrLevel('b1')).toBe(false);
      expect(isCefrLevel(1)).toBe(false);
      expect(isCefrLevel(null)).toBe(false);
    });
  });

  describe('sanitizeOfferedLevels', () => {
    it('keeps valid codes in canonical order and drops junk', () => {
      expect(sanitizeOfferedLevels(['B1', 'A1', 'X', 'A1'])).toEqual([
        'A1',
        'B1',
      ]);
    });

    it('returns [] for non-arrays', () => {
      expect(sanitizeOfferedLevels(undefined)).toEqual([]);
      expect(sanitizeOfferedLevels('A1')).toEqual([]);
      expect(sanitizeOfferedLevels(null)).toEqual([]);
    });
  });

  describe('sanitizeExamTimes', () => {
    it('keeps valid HH:mm, de-duplicates and sorts chronologically', () => {
      expect(
        sanitizeExamTimes(['14:00', '09:30', '14:00', 'bad', '25:00', '10:5']),
      ).toEqual(['09:30', '14:00']);
    });

    it('returns [] for non-arrays', () => {
      expect(sanitizeExamTimes(undefined)).toEqual([]);
      expect(sanitizeExamTimes('10:00')).toEqual([]);
    });
  });
});
