import { BadRequestException } from '@nestjs/common';
import {
  monthKeysEndingAt,
  parseDayRange,
  per100,
  previousRange,
  shareOf,
} from './departed-period';

describe('previousRange', () => {
  it('a whole calendar month goes to the previous calendar month', () => {
    expect(
      previousRange({ startDate: '2026-09-01', endDate: '2026-09-30' }),
    ).toEqual({ startDate: '2026-08-01', endDate: '2026-08-31' });
  });
  it('January goes to December of the year before', () => {
    expect(
      previousRange({ startDate: '2027-01-01', endDate: '2027-01-31' }),
    ).toEqual({ startDate: '2026-12-01', endDate: '2026-12-31' });
  });
  it('February of a leap year is whole at 29 days', () => {
    expect(
      previousRange({ startDate: '2028-03-01', endDate: '2028-03-31' }),
    ).toEqual({ startDate: '2028-02-01', endDate: '2028-02-29' });
  });
  it('any other range goes to the same number of days right before it', () => {
    expect(
      previousRange({ startDate: '2026-07-01', endDate: '2026-09-30' }),
    ).toEqual({ startDate: '2026-03-31', endDate: '2026-06-30' });
  });
  it('a one-day range', () => {
    expect(
      previousRange({ startDate: '2026-09-10', endDate: '2026-09-10' }),
    ).toEqual({ startDate: '2026-09-09', endDate: '2026-09-09' });
  });
});

describe('monthKeysEndingAt', () => {
  it('six months up to the month of the end date, ascending', () => {
    expect(monthKeysEndingAt('2026-09-30', 6)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });
  it('crosses the new year', () => {
    expect(monthKeysEndingAt('2027-02-10', 3)).toEqual([
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });
});

describe('per100 / shareOf', () => {
  it('rounds to one decimal', () => {
    expect(per100(64, 530)).toBe(12.1);
  });
  it('is null without a base', () => {
    expect(per100(3, 0)).toBeNull();
  });
  it('share is hidden under 5 at the start', () => {
    expect(shareOf(2, 4)).toBeNull();
    expect(shareOf(2, 5)).toBe(40);
  });
});

describe('parseDayRange', () => {
  it('turns Tashkent days into [gte, lt)', () => {
    const r = parseDayRange('2026-09-01', '2026-09-30');
    expect(r.gte.toISOString()).toBe('2026-08-31T19:00:00.000Z');
    expect(r.lt.toISOString()).toBe('2026-09-30T19:00:00.000Z');
  });
  it('refuses a reversed range', () => {
    expect(() => parseDayRange('2026-09-30', '2026-09-01')).toThrow(
      BadRequestException,
    );
  });
  it('refuses a calendar-impossible day', () => {
    expect(() => parseDayRange('2026-02-30', '2026-03-01')).toThrow(
      BadRequestException,
    );
  });
  it('refuses a range over ten years', () => {
    expect(() => parseDayRange('2010-01-01', '2026-01-01')).toThrow(
      BadRequestException,
    );
  });
});
