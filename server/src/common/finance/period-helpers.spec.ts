import { resolvePeriod } from './period-helpers';

/**
 * The center is in Tashkent (UTC+5, no DST) and every timestamp column is
 * stored as a UTC instant. A "day" a user picks in a report filter is a
 * TASHKENT calendar day, so its UTC window is [00:00 −5h, next 00:00 −5h).
 *
 * Regression: a real Click payment at 2026-08-05T19:18:44Z is 06.08 00:18 in
 * Tashkent, yet it showed up under the 05.08 filter because the bounds were
 * plain UTC midnight → 23:59:59.999Z.
 */
describe('resolvePeriod — Tashkent day bounds', () => {
  const inTsWindow = (p: { start: Date; endTs: Date }, iso: string) => {
    const t = new Date(iso);
    return t >= p.start && t <= p.endTs;
  };

  it('starts a single day at 00:00 Tashkent, not 00:00 UTC', () => {
    const p = resolvePeriod('2026-08-05', '2026-08-05');
    expect(p.start.toISOString()).toBe('2026-08-04T19:00:00.000Z');
  });

  it('ends a single day just before 00:00 Tashkent of the next day', () => {
    const p = resolvePeriod('2026-08-05', '2026-08-05');
    expect(p.endTs.toISOString()).toBe('2026-08-05T18:59:59.999Z');
  });

  it('excludes a payment made after midnight Tashkent from the previous day', () => {
    const p = resolvePeriod('2026-08-05', '2026-08-05');
    // 06.08.2026 00:18 Tashkent — belongs to 06.08, not 05.08.
    expect(inTsWindow(p, '2026-08-05T19:18:44.000Z')).toBe(false);
  });

  it('includes an after-midnight payment in the day it actually belongs to', () => {
    const p = resolvePeriod('2026-08-06', '2026-08-06');
    expect(inTsWindow(p, '2026-08-05T19:18:44.000Z')).toBe(true);
  });

  it('includes an early-morning Tashkent payment in its own day', () => {
    const p = resolvePeriod('2026-08-05', '2026-08-05');
    // 05.08 01:30 Tashkent = 04.08 20:30 UTC — the old UTC window missed it.
    expect(inTsWindow(p, '2026-08-04T20:30:00.000Z')).toBe(true);
  });

  it('keeps @db.Date bounds at plain UTC midnight so a date column is not shifted', () => {
    const p = resolvePeriod('2026-08-01', '2026-08-31');
    expect(p.startDate.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(p.endDate.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('does not let a month-end timestamp leak into the next month', () => {
    const august = resolvePeriod('2026-08-01', '2026-08-31');
    const september = resolvePeriod('2026-09-01', '2026-09-30');
    // 01.09.2026 00:32 Tashkent = 31.08 19:32 UTC.
    const afterMidnight = '2026-08-31T19:32:00.000Z';
    expect(inTsWindow(august, afterMidnight)).toBe(false);
    expect(inTsWindow(september, afterMidnight)).toBe(true);
  });

  it('leaves no gap between consecutive days', () => {
    const day = resolvePeriod('2026-08-05', '2026-08-05');
    const next = resolvePeriod('2026-08-06', '2026-08-06');
    expect(next.start.getTime() - day.endTs.getTime()).toBe(1);
  });
});
