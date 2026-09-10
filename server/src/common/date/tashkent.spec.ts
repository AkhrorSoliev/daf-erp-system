import {
  endOfUtcDay,
  tashkentDateStr,
  tashkentMonthKey,
  tashkentMonthRangeUtc,
  tashkentDayRangeUtc,
  tashkentDayStartUtc,
  tashkentRangeFilter,
  tashkentRangeUtc,
  utcMidnightFromDateStr,
} from './tashkent';

describe('tashkentDayStartUtc', () => {
  it('is 19:00 UTC of the previous day', () => {
    expect(tashkentDayStartUtc('2026-08-05').toISOString()).toBe(
      '2026-08-04T19:00:00.000Z',
    );
  });
});

describe('tashkentDateStr', () => {
  it('reports an after-midnight instant as the next Tashkent day', () => {
    expect(tashkentDateStr(new Date('2026-08-05T19:18:44.000Z'))).toBe(
      '2026-08-06',
    );
  });
});

describe('tashkentRangeUtc', () => {
  it('spans from the first day 00:00 to the day after the last, Tashkent', () => {
    const { gte, lt } = tashkentRangeUtc('2026-08-01', '2026-08-31');
    expect(gte.toISOString()).toBe('2026-07-31T19:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-08-31T19:00:00.000Z');
  });

  it('crosses a month end without gap or overlap', () => {
    const august = tashkentRangeUtc('2026-08-01', '2026-08-31');
    const september = tashkentRangeUtc('2026-09-01', '2026-09-30');
    expect(september.gte.getTime()).toBe(august.lt.getTime());
  });

  it('handles a single day', () => {
    const day = tashkentDayRangeUtc('2026-08-05');
    expect(day.gte.toISOString()).toBe('2026-08-04T19:00:00.000Z');
    expect(day.lt.toISOString()).toBe('2026-08-05T19:00:00.000Z');
  });
});

describe('utcMidnightFromDateStr', () => {
  it('stays at plain UTC midnight for @db.Date columns', () => {
    expect(utcMidnightFromDateStr('2026-08-05').toISOString()).toBe(
      '2026-08-05T00:00:00.000Z',
    );
  });
});

describe('tashkentRangeFilter', () => {
  it('is undefined when neither bound is given, so the caller adds no filter', () => {
    expect(tashkentRangeFilter(undefined, undefined)).toBeUndefined();
  });

  it('gives only a lower bound when the end is open', () => {
    expect(tashkentRangeFilter('2026-08-05', undefined)).toEqual({
      gte: new Date('2026-08-04T19:00:00.000Z'),
    });
  });

  it('gives an exclusive upper bound that still includes the whole last day', () => {
    const f = tashkentRangeFilter(undefined, '2026-08-05');
    expect(f).toEqual({ lt: new Date('2026-08-05T19:00:00.000Z') });
    // 05.08 23:30 Tashkent = 05.08 18:30 UTC — inside the day, must be kept.
    expect(new Date('2026-08-05T18:30:00.000Z') < f!.lt!).toBe(true);
  });
});

describe('tashkentMonthKey', () => {
  it('puts an after-midnight instant in the month its Tashkent clock shows', () => {
    // 01.09.2026 00:32 Tashkent — August by UTC, September in the office.
    expect(tashkentMonthKey(new Date('2026-08-31T19:32:00.000Z'))).toBe(
      '2026-09',
    );
  });
});

describe('tashkentMonthRangeUtc', () => {
  it('spans a whole Tashkent month', () => {
    const { gte, lt } = tashkentMonthRangeUtc('2026-08');
    expect(gte.toISOString()).toBe('2026-07-31T19:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-08-31T19:00:00.000Z');
  });

  it('chains month to month with no gap', () => {
    expect(tashkentMonthRangeUtc('2026-08').lt.getTime()).toBe(
      tashkentMonthRangeUtc('2026-09').gte.getTime(),
    );
  });

  it('rolls over a year end', () => {
    expect(tashkentMonthRangeUtc('2026-12').lt.toISOString()).toBe(
      '2026-12-31T19:00:00.000Z',
    );
  });
});

describe('endOfUtcDay', () => {
  it('is the last millisecond of the UTC calendar day', () => {
    expect(endOfUtcDay('2026-08-05').toISOString()).toBe(
      '2026-08-05T23:59:59.999Z',
    );
  });

  it('does not depend on the process timezone, unlike setHours', () => {
    // setHours(23,59,59,999) on a +05:00 host lands five hours earlier.
    const viaHelper = endOfUtcDay('2026-08-05').getTime();
    const utcMidnight = Date.UTC(2026, 7, 5);
    expect(viaHelper - utcMidnight).toBe(86_400_000 - 1);
  });
});
