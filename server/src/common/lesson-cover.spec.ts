import { coverFloor, currentCoverWhere, isCoverCurrent } from './lesson-cover';

/**
 * The rule is one line, and the whole point is WHERE the line falls. Tashkent
 * is UTC+5, so between 19:00 and 24:00 UTC it is already tomorrow there — a
 * floor built from the raw UTC date would drop a teacher's own cover for the
 * last five hours of every UTC day, or keep yesterday's alive for the first
 * five. Both are single-character mistakes and neither shows up in a test that
 * runs at noon.
 */
describe('lesson cover window', () => {
  const at = (iso: string) => new Date(iso);

  describe('coverFloor — where the day starts', () => {
    it('is the UTC midnight of the TASHKENT date, not of the UTC date', () => {
      // 20:00 UTC on the 24th is 01:00 on the 25th in Tashkent.
      expect(coverFloor(at('2026-08-24T20:00:00.000Z')).toISOString()).toBe(
        '2026-08-25T00:00:00.000Z',
      );
    });

    it('has not rolled over just before the Tashkent midnight', () => {
      // 18:59 UTC is 23:59 the same day in Tashkent.
      expect(coverFloor(at('2026-08-24T18:59:00.000Z')).toISOString()).toBe(
        '2026-08-24T00:00:00.000Z',
      );
    });

    it('holds through the small hours of the UTC day', () => {
      expect(coverFloor(at('2026-08-24T00:01:00.000Z')).toISOString()).toBe(
        '2026-08-24T00:00:00.000Z',
      );
    });
  });

  describe("isCoverCurrent — today's cover works, yesterday's does not", () => {
    const NOW = at('2026-08-24T09:00:00.000Z'); // 14:00 Tashkent

    it("admits today's lesson", () => {
      expect(isCoverCurrent(at('2026-08-24T00:00:00.000Z'), NOW)).toBe(true);
    });

    it('admits a cover booked ahead', () => {
      expect(isCoverCurrent(at('2026-08-30T00:00:00.000Z'), NOW)).toBe(true);
    });

    it('refuses yesterday', () => {
      expect(isCoverCurrent(at('2026-08-23T00:00:00.000Z'), NOW)).toBe(false);
    });

    it("still admits today's lesson late in the Tashkent evening", () => {
      // 18:30 UTC = 23:30 Tashkent, same day. A teacher marking the register
      // after an evening class must not be locked out by the clock.
      expect(
        isCoverCurrent(
          at('2026-08-24T00:00:00.000Z'),
          at('2026-08-24T18:30:00.000Z'),
        ),
      ).toBe(true);
    });

    it('drops it once Tashkent is into the next day', () => {
      // 19:30 UTC = 00:30 on the 25th in Tashkent. The cover is over.
      expect(
        isCoverCurrent(
          at('2026-08-24T00:00:00.000Z'),
          at('2026-08-24T19:30:00.000Z'),
        ),
      ).toBe(false);
    });
  });

  describe('currentCoverWhere — what the three callers share', () => {
    const NOW = at('2026-08-24T09:00:00.000Z');

    it('names the teacher, excludes deleted rows, and floors the date', () => {
      expect(currentCoverWhere(42, NOW)).toEqual({
        deletedAt: null,
        teacherIds: { has: 42 },
        date: { gte: at('2026-08-24T00:00:00.000Z') },
      });
    });

    it('agrees with isCoverCurrent — they are the same rule twice', () => {
      const floor = (currentCoverWhere(42, NOW).date as { gte: Date }).gte;
      expect(isCoverCurrent(floor, NOW)).toBe(true);
      expect(isCoverCurrent(new Date(floor.getTime() - 1), NOW)).toBe(false);
    });
  });
});
