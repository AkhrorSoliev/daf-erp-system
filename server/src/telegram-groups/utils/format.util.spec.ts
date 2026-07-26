import {
  firstOfThisMonthDate,
  firstOfThisMonthUtc,
  formatDate,
  formatNumber,
  formatSum,
  isTashkentSunday,
  tashkentDayRange,
  tashkentTodayDate,
} from './format.util';

describe('format.util', () => {
  describe('formatNumber', () => {
    it('inserts non-breaking-space thousands separators', () => {
      expect(formatNumber(1_234_567)).toBe('1 234 567');
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(-1500)).toBe('-1 500');
    });

    it('rounds and handles non-finite', () => {
      expect(formatNumber(1.6)).toBe('2');
      expect(formatNumber(NaN)).toBe('—');
      expect(formatNumber(Infinity)).toBe('—');
    });
  });

  describe('formatSum', () => {
    it("appends so'm", () => {
      expect(formatSum(1_000_000)).toBe("1 000 000 so'm");
    });
  });

  describe('formatDate', () => {
    it('formats as dd.MM.yyyy in the host timezone', () => {
      const d = new Date(2026, 4, 29);
      expect(formatDate(d)).toBe('29.05.2026');
    });
  });

  describe('tashkentDayRange', () => {
    it('returns a 24h UTC window starting at Tashkent midnight', () => {
      // 12:00 UTC on 2026-05-29 = 17:00 Tashkent on 2026-05-29.
      const now = new Date('2026-05-29T12:00:00.000Z');
      const r = tashkentDayRange(now);
      expect(r.start.toISOString()).toBe('2026-05-28T19:00:00.000Z');
      expect(r.end.toISOString()).toBe('2026-05-29T19:00:00.000Z');
    });

    it('crosses midnight correctly just before Tashkent 00:00', () => {
      // 18:00 UTC = 23:00 Tashkent — still the previous calendar day.
      const now = new Date('2026-05-29T18:00:00.000Z');
      const r = tashkentDayRange(now);
      expect(r.start.toISOString()).toBe('2026-05-28T19:00:00.000Z');
    });

    it('flips to the next day right after Tashkent midnight', () => {
      // 19:01 UTC = 00:01 Tashkent next day.
      const now = new Date('2026-05-29T19:01:00.000Z');
      const r = tashkentDayRange(now);
      expect(r.start.toISOString()).toBe('2026-05-29T19:00:00.000Z');
    });
  });

  describe('tashkentTodayDate', () => {
    it("returns the Tashkent calendar date at 00:00 UTC for DATE-column queries", () => {
      // 12:00 UTC on 2026-05-29 = 17:00 Tashkent on 2026-05-29.
      const now = new Date('2026-05-29T12:00:00.000Z');
      expect(tashkentTodayDate(now).toISOString()).toBe('2026-05-29T00:00:00.000Z');
    });

    it('matches the day-after midnight Tashkent (regression: avoids -5h shift)', () => {
      // 19:01 UTC = 00:01 Tashkent on 2026-05-30. Must return 2026-05-30, not 2026-05-29.
      const now = new Date('2026-05-29T19:01:00.000Z');
      expect(tashkentTodayDate(now).toISOString()).toBe('2026-05-30T00:00:00.000Z');
    });

    it('does NOT equal tashkentDayRange().start (which would re-introduce the bug)', () => {
      const now = new Date('2026-05-29T12:00:00.000Z');
      const range = tashkentDayRange(now);
      const date = tashkentTodayDate(now);
      // The fix is exactly that these two differ by +5h.
      expect(date.getTime() - range.start.getTime()).toBe(5 * 60 * 60 * 1000);
    });
  });

  describe('firstOfThisMonthUtc', () => {
    it('returns Tashkent first of month, expressed in UTC', () => {
      const now = new Date('2026-05-15T10:00:00.000Z');
      // 2026-05-01 00:00 Tashkent = 2026-04-30 19:00 UTC.
      expect(firstOfThisMonthUtc(now).toISOString()).toBe('2026-04-30T19:00:00.000Z');
    });
  });

  describe('firstOfThisMonthDate', () => {
    it('returns the 1st of the Tashkent month at 00:00 UTC for DATE-column queries', () => {
      const now = new Date('2026-07-15T10:00:00.000Z');
      expect(firstOfThisMonthDate(now).toISOString()).toBe('2026-07-01T00:00:00.000Z');
    });

    it('rolls into the new month at Tashkent midnight, not 5h early (regression)', () => {
      // 2026-06-30 19:01 UTC = 2026-07-01 00:01 Tashkent → must be July, not June.
      const now = new Date('2026-06-30T19:01:00.000Z');
      expect(firstOfThisMonthDate(now).toISOString()).toBe('2026-07-01T00:00:00.000Z');
    });

    it('is +5h ahead of firstOfThisMonthUtc — the exact off-by-one the DATE variant fixes', () => {
      const now = new Date('2026-07-15T10:00:00.000Z');
      expect(
        firstOfThisMonthDate(now).getTime() - firstOfThisMonthUtc(now).getTime(),
      ).toBe(5 * 60 * 60 * 1000);
    });
  });

  describe('isTashkentSunday', () => {
    it('is true on Sunday Tashkent', () => {
      // 2026-05-31 is a Sunday. 04:00 UTC = 09:00 Tashkent Sunday.
      expect(isTashkentSunday(new Date('2026-05-31T04:00:00.000Z'))).toBe(true);
    });

    it('is false on Friday Tashkent', () => {
      expect(isTashkentSunday(new Date('2026-05-29T12:00:00.000Z'))).toBe(false);
    });

    it('handles the day-crossing edge (Sat 23:00 Tashkent = Sat 18:00 UTC)', () => {
      // 2026-05-30 18:00 UTC = 23:00 Tashkent Saturday — not Sunday yet.
      expect(isTashkentSunday(new Date('2026-05-30T18:00:00.000Z'))).toBe(false);
      // 2026-05-30 19:00 UTC = 00:00 Tashkent Sunday.
      expect(isTashkentSunday(new Date('2026-05-30T19:00:00.000Z'))).toBe(true);
    });
  });
});
