import { tashkentDateStr, tashkentDayRangeUtc } from './date-utils';

describe('tashkentDayRangeUtc', () => {
  it('bounds a Tashkent calendar day as UTC instants (UTC+5)', () => {
    const { gte, lt } = tashkentDayRangeUtc('2026-06-09');
    // Tashkent 2026-06-09 00:00 == 2026-06-08T19:00:00Z; next day at 19:00Z.
    expect(gte.toISOString()).toBe('2026-06-08T19:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-06-09T19:00:00.000Z');
  });

  it('includes an early-morning Tashkent call (02:00) in the right day', () => {
    // 02:00 Tashkent on 2026-06-09 == 2026-06-08T21:00:00Z.
    const call = new Date('2026-06-08T21:00:00.000Z');
    expect(tashkentDateStr(call)).toBe('2026-06-09');
    const { gte, lt } = tashkentDayRangeUtc('2026-06-09');
    expect(call >= gte && call < lt).toBe(true);
    // And it must NOT fall into the previous Tashkent day's window.
    const prev = tashkentDayRangeUtc('2026-06-08');
    expect(call >= prev.gte && call < prev.lt).toBe(false);
  });

  it('includes a late-evening Tashkent call (23:00) in the right day', () => {
    // 23:00 Tashkent on 2026-06-09 == 2026-06-09T18:00:00Z.
    const call = new Date('2026-06-09T18:00:00.000Z');
    expect(tashkentDateStr(call)).toBe('2026-06-09');
    const { gte, lt } = tashkentDayRangeUtc('2026-06-09');
    expect(call >= gte && call < lt).toBe(true);
  });

  it('excludes the instant exactly at the next day boundary', () => {
    const { lt } = tashkentDayRangeUtc('2026-06-09');
    const next = tashkentDayRangeUtc('2026-06-10');
    // The end of one day equals the start of the next (half-open interval).
    expect(lt.getTime()).toBe(next.gte.getTime());
  });
});
