import {
  CEFR_LEVELS,
  isCefrLevel,
  resolveParticipantFee,
  sanitizeOfferedLevels,
} from './mock-exam-pricing.util';

describe('mock-exam-pricing.util', () => {
  describe('resolveParticipantFee', () => {
    const exam = { price: 100000, studentPrice: 50000 };

    it('charges the full price for a non-DaF (outsider) registrant', () => {
      expect(resolveParticipantFee(exam, false)).toBe(100000);
    });

    it('charges the discounted studentPrice for a DaF student', () => {
      expect(resolveParticipantFee(exam, true)).toBe(50000);
    });

    it('falls back to full price for a DaF student when no discount is set', () => {
      expect(resolveParticipantFee({ price: 100000 }, true)).toBe(100000);
      expect(
        resolveParticipantFee({ price: 100000, studentPrice: null }, true),
      ).toBe(100000);
    });

    it('respects a studentPrice of 0 (free for DaF students)', () => {
      expect(
        resolveParticipantFee({ price: 100000, studentPrice: 0 }, true),
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
});
