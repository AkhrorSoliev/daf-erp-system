import { BadRequestException } from '@nestjs/common';
import { monthWindow, resolvePeriod } from './attendance-stats-period';

const TODAY = '2026-10-17';

describe('resolvePeriod', () => {
  it('a whole month compares with the month before and loads the six bars', () => {
    const p = resolvePeriod('2026-09-01', '2026-09-30', TODAY);
    expect(p.window).toEqual({ from: '2026-09-01', to: '2026-10-01' });
    expect(p.previous).toEqual({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
    expect(p.previousWindow).toEqual({ from: '2026-08-01', to: '2026-09-01' });
    expect(p.months).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(p.load).toEqual({ from: '2026-05-01', to: '2026-10-01' });
    expect(p.elapsedDays).toBe(30);
  });

  it('a custom range compares with the same number of days before it', () => {
    const p = resolvePeriod('2026-10-05', '2026-10-11', TODAY);
    expect(p.previous).toEqual({
      startDate: '2026-09-28',
      endDate: '2026-10-04',
    });
    expect(p.elapsedDays).toBe(7);
  });

  it('counts the days only up to today (the current month runs to its last day)', () => {
    expect(resolvePeriod('2026-10-01', '2026-10-31', TODAY).elapsedDays).toBe(
      17,
    );
    expect(resolvePeriod('2026-11-01', '2026-11-30', TODAY).elapsedDays).toBe(
      0,
    );
  });

  it('a previous period before 2026-05-01 is null, not a false zero', () => {
    const may = resolvePeriod('2026-05-01', '2026-05-31', TODAY);
    expect(may.previous).toBeNull();
    expect(may.previousWindow).toBeNull();
    expect(may.months).toEqual(['2026-05']);
    expect(
      resolvePeriod('2026-06-01', '2026-08-31', TODAY).previous,
    ).toBeNull();
  });

  it('never shows more than six month bars', () => {
    const p = resolvePeriod('2027-01-01', '2027-03-31', '2027-04-10');
    expect(p.months).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
    ]);
    expect(p.load.from).toBe('2026-10-01');
  });

  it('refuses a start before 2026-05-01, in Uzbek', () => {
    expect(() => resolvePeriod('2026-04-30', '2026-05-31', TODAY)).toThrow(
      new BadRequestException('Bu hisobot 1-may 2026 dan boshlanadi'),
    );
  });

  it('refuses an unreal day and a reversed range (the 7a checks)', () => {
    expect(() => resolvePeriod('2026-02-30', '2026-03-01', TODAY)).toThrow(
      BadRequestException,
    );
    expect(() => resolvePeriod('2026-09-30', '2026-09-01', TODAY)).toThrow(
      BadRequestException,
    );
  });

  it('the previous period starts on the floor day, not before it', () => {
    const p = resolvePeriod('2026-05-08', '2026-05-14', TODAY);
    expect(p.previous).toEqual({
      startDate: '2026-05-01',
      endDate: '2026-05-07',
    });
    expect(
      resolvePeriod('2026-05-05', '2026-05-11', TODAY).previous,
    ).toBeNull();
  });

  it('elapsedDays at the edges: first day 1, the day before 0, last day the whole length', () => {
    const days = (today: string) =>
      resolvePeriod('2026-10-05', '2026-10-11', today).elapsedDays;
    expect(days('2026-10-05')).toBe(1);
    expect(days('2026-10-04')).toBe(0);
    expect(days('2026-10-11')).toBe(7);
  });
});

describe('monthWindow', () => {
  it('is the whole calendar month, upper bound exclusive', () => {
    expect(monthWindow('2026-12')).toEqual({
      from: '2026-12-01',
      to: '2027-01-01',
    });
  });
});
