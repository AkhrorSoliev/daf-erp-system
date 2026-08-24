import { buildScheduleDayResolver } from './schedule-resolver';

describe('buildScheduleDayResolver', () => {
  it('returns current exactDays for every date when there are no snapshots', () => {
    const resolve = buildScheduleDayResolver(
      [],
      ['monday', 'wednesday', 'friday'],
    );
    // Mon=1, Wed=3, Fri=5
    expect(resolve('2026-05-04')).toEqual([1, 3, 5]); // Monday in May
    expect(resolve('2026-01-01')).toEqual([1, 3, 5]); // far past
  });

  it('treats undefined snapshots as no snapshots (no crash)', () => {
    const resolve = buildScheduleDayResolver(undefined as unknown as [], [
      'tuesday',
    ]);
    expect(resolve('2026-05-05')).toEqual([2]);
  });

  it('uses the snapshot covering the date', () => {
    const resolve = buildScheduleDayResolver(
      [
        {
          exactDays: ['tuesday', 'thursday', 'saturday'],
          validFrom: new Date('2026-04-01T00:00:00Z'),
          validTo: new Date('2026-06-02T06:00:00Z'),
        },
        {
          exactDays: ['monday', 'wednesday', 'friday'],
          validFrom: new Date('2026-06-02T06:00:00Z'),
          validTo: null,
        },
      ],
      ['monday', 'wednesday', 'friday'],
    );
    // May → covered by the first (old) snapshot → Tue/Thu/Sat
    expect(resolve('2026-05-12')).toEqual([2, 4, 6]);
    // June → covered by the open (current) snapshot → Mon/Wed/Fri
    expect(resolve('2026-06-08')).toEqual([1, 3, 5]);
  });

  it('returns null for dates before the earliest snapshot (unknown old period)', () => {
    // The bug case: a single snapshot created when the schedule changed, with
    // no historical coverage of the earlier period. May predates it → unknown,
    // so callers must rely on actual attendance rather than projecting the new
    // schedule backwards.
    const resolve = buildScheduleDayResolver(
      [
        {
          exactDays: ['friday', 'monday', 'wednesday'],
          validFrom: new Date('2026-06-02T06:07:24Z'),
          validTo: null,
        },
      ],
      ['friday', 'monday', 'wednesday'],
    );
    expect(resolve('2026-05-12')).toBeNull();
    expect(resolve('2026-05-30')).toBeNull();
    // On/after the snapshot's Tashkent date → current schedule applies
    expect(resolve('2026-06-08')).toEqual([5, 1, 3]);
  });

  it('compares against the Tashkent calendar date of validFrom', () => {
    // validFrom at 20:00 UTC on Jun 1 is Jun 2 in Tashkent (+5h). A Jun 1
    // lesson therefore predates the snapshot window.
    const resolve = buildScheduleDayResolver(
      [
        {
          exactDays: ['monday'],
          validFrom: new Date('2026-06-01T20:00:00Z'),
          validTo: null,
        },
      ],
      ['monday'],
    );
    expect(resolve('2026-06-01')).toBeNull();
    expect(resolve('2026-06-02')).toEqual([1]);
  });
});
