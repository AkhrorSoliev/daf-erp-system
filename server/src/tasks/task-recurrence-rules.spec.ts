import { BadRequestException } from '@nestjs/common';
import {
  firstRunDate,
  isWorkingDay,
  nextRunDateAfter,
  normalizeSchedule,
  recurrenceDueAt,
  runGroups,
  type RecurrenceSchedule,
} from './task-recurrence-rules';

// 2026-10-11 is a Sunday, 2026-10-12 a Monday.
const none = new Set<string>();
const daily: RecurrenceSchedule = {
  freq: 'DAILY',
  weekdays: [],
  dayOfMonth: null,
  dueTime: '18:00',
};
const weekly = (...d: number[]): RecurrenceSchedule => ({
  freq: 'WEEKLY',
  weekdays: d,
  dayOfMonth: null,
  dueTime: '10:00',
});
const monthly = (n: number): RecurrenceSchedule => ({
  freq: 'MONTHLY',
  weekdays: [],
  dayOfMonth: n,
  dueTime: '09:00',
});

describe('normalizeSchedule', () => {
  it('defaults the time to 18:00 and clears what the frequency does not use', () => {
    expect(
      normalizeSchedule({ freq: 'DAILY', weekdays: [1], dayOfMonth: 5 }),
    ).toEqual(daily);
    expect(
      normalizeSchedule({
        freq: 'WEEKLY',
        weekdays: [4, 1, 4],
        dueTime: '10:00',
      }),
    ).toEqual(weekly(1, 4));
    expect(
      normalizeSchedule({
        freq: 'MONTHLY',
        dayOfMonth: 28,
        weekdays: [2],
        dueTime: '09:00',
      }),
    ).toEqual(monthly(28));
  });

  it('accepts the edges of the 08:00–22:00 window', () => {
    expect(normalizeSchedule({ freq: 'DAILY', dueTime: '08:00' }).dueTime).toBe(
      '08:00',
    );
    expect(normalizeSchedule({ freq: 'DAILY', dueTime: '22:00' }).dueTime).toBe(
      '22:00',
    );
  });

  it.each([
    [{ freq: 'WEEKLY' as const, weekdays: [] }],
    [{ freq: 'WEEKLY' as const }],
    [{ freq: 'WEEKLY' as const, weekdays: [0] }],
    [{ freq: 'WEEKLY' as const, weekdays: [7] }],
    [{ freq: 'MONTHLY' as const }],
    [{ freq: 'MONTHLY' as const, dayOfMonth: 0 }],
    [{ freq: 'MONTHLY' as const, dayOfMonth: 29 }],
    [{ freq: 'DAILY' as const, dueTime: '07:59' }],
    [{ freq: 'DAILY' as const, dueTime: '22:01' }],
    [{ freq: 'DAILY' as const, dueTime: '9:00' }],
  ])('refuses %j with a 400', (input) => {
    expect(() => normalizeSchedule(input)).toThrow(BadRequestException);
  });
});

describe('isWorkingDay', () => {
  it('is false on a Sunday and on a holiday', () => {
    expect(isWorkingDay('2026-10-11', none)).toBe(false);
    expect(isWorkingDay('2026-10-12', new Set(['2026-10-12']))).toBe(false);
    expect(isWorkingDay('2026-10-12', none)).toBe(true);
  });
});

describe('nextRunDateAfter', () => {
  it('daily: the next day, never a Sunday', () => {
    expect(nextRunDateAfter(daily, '2026-10-12', none)).toBe('2026-10-13');
    expect(nextRunDateAfter(daily, '2026-10-10', none)).toBe('2026-10-12');
  });

  it("daily: the branch's holidays are skipped", () => {
    const h = new Set(['2026-10-13', '2026-10-14']);
    expect(nextRunDateAfter(daily, '2026-10-12', h)).toBe('2026-10-15');
  });

  it('weekly: the next named day', () => {
    expect(nextRunDateAfter(weekly(1), '2026-10-12', none)).toBe('2026-10-19');
    expect(nextRunDateAfter(weekly(1, 3), '2026-10-12', none)).toBe(
      '2026-10-14',
    );
    expect(nextRunDateAfter(weekly(1, 3), '2026-10-14', none)).toBe(
      '2026-10-19',
    );
  });

  it('weekly: a Monday holiday moves the run to Tuesday; the run after is the next Monday', () => {
    const h = new Set(['2026-10-19']);
    expect(nextRunDateAfter(weekly(1), '2026-10-12', h)).toBe('2026-10-20');
    expect(nextRunDateAfter(weekly(1), '2026-10-20', h)).toBe('2026-10-26');
  });

  it('weekly: two days pushed onto the same working day make one run', () => {
    const h = new Set(['2026-10-19', '2026-10-20']);
    expect(nextRunDateAfter(weekly(1, 2), '2026-10-14', h)).toBe('2026-10-21');
    expect(nextRunDateAfter(weekly(1, 2), '2026-10-21', h)).toBe('2026-10-26');
  });

  it('monthly: the same day next month; a Sunday moves to Monday', () => {
    expect(nextRunDateAfter(monthly(5), '2026-10-05', none)).toBe('2026-11-05');
    expect(nextRunDateAfter(monthly(8), '2026-10-08', none)).toBe('2026-11-09');
    expect(nextRunDateAfter(monthly(8), '2026-11-09', none)).toBe('2026-12-08');
  });

  it('monthly: the 28th exists every month, and a day still ahead is this month', () => {
    expect(nextRunDateAfter(monthly(28), '2026-01-28', none)).toBe(
      '2026-02-28',
    );
    expect(nextRunDateAfter(monthly(28), '2026-02-28', none)).toBe(
      '2026-03-28',
    );
    expect(nextRunDateAfter(monthly(28), '2026-10-12', none)).toBe(
      '2026-10-28',
    );
  });
});

describe('firstRunDate', () => {
  const at = (iso: string) => new Date(iso);
  it('today, while the due time is still ahead', () => {
    // Monday 09:00 Tashkent; due 18:00.
    expect(firstRunDate(daily, at('2026-10-12T04:00:00Z'), none)).toBe(
      '2026-10-12',
    );
  });
  it('the next run day once the due time has come', () => {
    expect(firstRunDate(daily, at('2026-10-12T13:00:00Z'), none)).toBe(
      '2026-10-13',
    );
    expect(firstRunDate(daily, at('2026-10-12T14:00:00Z'), none)).toBe(
      '2026-10-13',
    );
  });
  it('a Sunday makes Monday the first day', () => {
    expect(firstRunDate(daily, at('2026-10-11T05:00:00Z'), none)).toBe(
      '2026-10-12',
    );
  });
  it('weekly: the first named day from today', () => {
    expect(firstRunDate(weekly(1), at('2026-10-13T04:00:00Z'), none)).toBe(
      '2026-10-19',
    );
  });
});

describe('recurrenceDueAt', () => {
  it('is the Tashkent wall time of that day', () => {
    expect(recurrenceDueAt('2026-10-12', '10:00').toISOString()).toBe(
      '2026-10-12T05:00:00.000Z',
    );
    expect(recurrenceDueAt('2026-10-12', '22:00').toISOString()).toBe(
      '2026-10-12T17:00:00.000Z',
    );
  });
});

describe('runGroups', () => {
  it('joint: one task for everyone, none while one of the rule is open', () => {
    expect(runGroups(false, [1, 2], [])).toEqual([[1, 2]]);
    expect(runGroups(false, [1, 2], [{ assigneeIds: [9] }])).toEqual([]);
  });
  it('separate copies: a copy each, except for whoever still has an open one', () => {
    expect(runGroups(true, [1, 2], [])).toEqual([[1], [2]]);
    expect(runGroups(true, [1, 2], [{ assigneeIds: [1] }])).toEqual([[2]]);
  });
  it('separate copies: an open copy held by someone else never blocks this assignee', () => {
    expect(runGroups(true, [20], [{ assigneeIds: [21] }])).toEqual([[20]]);
  });
  it('one assignee or nobody', () => {
    expect(runGroups(true, [1], [{ assigneeIds: [1] }])).toEqual([]);
    expect(runGroups(false, [], [])).toEqual([]);
  });
});
