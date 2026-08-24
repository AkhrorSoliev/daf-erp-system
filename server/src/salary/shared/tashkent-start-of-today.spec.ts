import {
  parseTashkentDateStart,
  tashkentStartOfToday,
} from './resolve-current-period';

/**
 * A salary rate version's `effectiveFrom` has to land exactly on Tashkent
 * midnight, because the period boundaries it is compared against are built the
 * same way. `SalaryConfigService` used to compute the default via
 * `toLocaleString('en-US', { timeZone: 'Asia/Tashkent' })` followed by
 * `setHours(0,0,0,0)` — and `setHours` operates in the PROCESS timezone, not
 * the one named in the format call. So the answer depended on the host:
 *
 *     TZ=UTC              → 2026-08-23T19:00:00Z   correct
 *     TZ=Asia/Tashkent    → 2026-08-23T14:00:00Z   5h early
 *     TZ=America/New_York → 2026-08-23T23:00:00Z   4h late
 *
 * Five hours early puts the new rate in force from 19:00 the previous evening,
 * so the evening lessons of the day before are paid at it. These tests use only
 * absolute instants, so they hold whatever `TZ` the suite runs under — run them
 * with `TZ=Asia/Tashkent npx jest` and they still pass.
 */
describe('tashkentStartOfToday', () => {
  const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

  /** Tashkent midnight of Y-M-D, expressed as the UTC instant it really is. */
  const tashkentMidnight = (y: number, m: number, d: number) =>
    new Date(Date.UTC(y, m - 1, d) - TASHKENT_OFFSET_MS).toISOString();

  it('returns Tashkent midnight for an instant in the middle of the day', () => {
    // 2026-08-24 10:00 Tashkent == 05:00 UTC
    const now = new Date('2026-08-24T05:00:00.000Z');
    expect(tashkentStartOfToday(now).toISOString()).toBe(
      tashkentMidnight(2026, 8, 24),
    );
  });

  it('is exact at Tashkent midnight itself', () => {
    const now = new Date(tashkentMidnight(2026, 8, 24));
    expect(tashkentStartOfToday(now).toISOString()).toBe(
      tashkentMidnight(2026, 8, 24),
    );
  });

  it('stays on the previous Tashkent day one millisecond before midnight', () => {
    const now = new Date(Date.parse(tashkentMidnight(2026, 8, 24)) - 1);
    expect(tashkentStartOfToday(now).toISOString()).toBe(
      tashkentMidnight(2026, 8, 23),
    );
  });

  it('reads 20:00 UTC as the NEXT Tashkent day, which is 01:00 there', () => {
    // The case a UTC-centric implementation gets wrong in the other direction.
    const now = new Date('2026-08-23T20:00:00.000Z');
    expect(tashkentStartOfToday(now).toISOString()).toBe(
      tashkentMidnight(2026, 8, 24),
    );
  });

  it('crosses a month boundary', () => {
    // 2026-08-31 23:00 Tashkent == 18:00 UTC
    expect(
      tashkentStartOfToday(new Date('2026-08-31T18:00:00.000Z')).toISOString(),
    ).toBe(tashkentMidnight(2026, 8, 31));
    // …one hour later it is September in Tashkent.
    expect(
      tashkentStartOfToday(new Date('2026-08-31T19:00:00.000Z')).toISOString(),
    ).toBe(tashkentMidnight(2026, 9, 1));
  });

  it('never depends on the host timezone', () => {
    // The regression, stated directly: `setHours` in a UTC process and a
    // Tashkent process produced instants five hours apart from the same input.
    const now = new Date('2026-08-24T05:00:00.000Z');
    const broken = () => {
      const t = new Date(
        now.toLocaleString('en-US', { timeZone: 'Asia/Tashkent' }),
      );
      t.setHours(0, 0, 0, 0);
      return new Date(t.getTime() - TASHKENT_OFFSET_MS);
    };
    const drift = Math.abs(
      broken().getTime() - tashkentStartOfToday(now).getTime(),
    );
    // Under TZ=UTC the old code happens to agree; anywhere else it does not.
    // Either way the new implementation is the one anchored to the instant.
    expect(tashkentStartOfToday(now).toISOString()).toBe(
      tashkentMidnight(2026, 8, 24),
    );
    // Documented, not asserted as non-zero: the drift is 0 only on a UTC host.
    expect(drift % (60 * 60 * 1000)).toBe(0);
  });

  it('agrees with parseTashkentDateStart for the same calendar day', () => {
    const now = new Date('2026-08-24T05:00:00.000Z');
    expect(tashkentStartOfToday(now).toISOString()).toBe(
      parseTashkentDateStart('2026-08-24').toISOString(),
    );
  });
});
