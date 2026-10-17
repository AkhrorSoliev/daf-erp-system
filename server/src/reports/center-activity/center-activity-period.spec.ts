import { BadRequestException } from '@nestjs/common';
import {
  CENTER_FIRST_MONTH,
  asOfForMonth,
  monthsUpTo,
  parseCenterMonth,
} from './center-activity-period';

// 2026-10-17 10:00 Toshkent = 05:00 UTC
const NOW = new Date('2026-10-17T05:00:00.000Z');

describe('parseCenterMonth', () => {
  it('empty means the current Tashkent month', () => {
    expect(parseCenterMonth(undefined, NOW)).toBe('2026-10');
    expect(parseCenterMonth('', NOW)).toBe('2026-10');
  });

  it('uses the Tashkent month, not the UTC one (00:30 on the 1st)', () => {
    // 2026-10-31T19:30Z is 2026-11-01 00:30 in Tashkent
    expect(parseCenterMonth(undefined, new Date('2026-10-31T19:30:00Z'))).toBe(
      '2026-11',
    );
  });

  it('accepts the floor month and the current month', () => {
    expect(parseCenterMonth('2026-05', NOW)).toBe('2026-05');
    expect(parseCenterMonth('2026-10', NOW)).toBe('2026-10');
  });

  it('refuses a month before May 2026 and a future month, in Uzbek', () => {
    expect(() => parseCenterMonth('2026-04', NOW)).toThrow(
      new BadRequestException('Bu hisobot may 2026 dan boshlanadi'),
    );
    expect(() => parseCenterMonth('2026-11', NOW)).toThrow(
      new BadRequestException("Kelajak oyni tanlab bo'lmaydi"),
    );
  });
});

describe('asOfForMonth', () => {
  it('a past month is read at its last millisecond', () => {
    // 2026-09-30 23:59:59.999 Toshkent = 18:59:59.999 UTC
    expect(asOfForMonth('2026-09', NOW).toISOString()).toBe(
      '2026-09-30T18:59:59.999Z',
    );
  });

  it('the current month is read now', () => {
    expect(asOfForMonth('2026-10', NOW).getTime()).toBe(NOW.getTime());
  });
});

describe('monthsUpTo', () => {
  it('counts back at most six months, never before the floor', () => {
    expect(monthsUpTo('2026-10')).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(monthsUpTo('2026-07')).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(monthsUpTo('2027-02')).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
    expect(monthsUpTo('2027-02')[0] >= CENTER_FIRST_MONTH).toBe(true);
  });
});
