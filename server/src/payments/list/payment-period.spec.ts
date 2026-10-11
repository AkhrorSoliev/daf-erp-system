import { BadRequestException } from '@nestjs/common';
import { tashkentRangeUtc } from '../../common/date/tashkent';
import { parsePaymentPeriod, periodView } from './payment-period';

const reject = (s?: string, e?: string) => {
  try {
    parsePaymentPeriod(s, e);
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException);
    return (err as BadRequestException).message;
  }
  throw new Error('expected a 400');
};

describe('parsePaymentPeriod', () => {
  it('needs both ends', () => {
    expect(reject(undefined, '2026-10-31')).toBe('Davr boshi va oxiri kerak');
    expect(reject('2026-10-01', undefined)).toBe('Davr boshi va oxiri kerak');
    expect(reject('', '')).toBe('Davr boshi va oxiri kerak');
  });

  it('refuses a day the calendar does not have', () => {
    expect(reject('2026-02-30', '2026-03-31')).toBe(
      "Bunday sana kalendarda yo'q",
    );
    expect(reject('2026-10-01', '2026-13-01')).toBe(
      "Bunday sana kalendarda yo'q",
    );
  });

  it('refuses a start after the end', () => {
    expect(reject('2026-10-02', '2026-10-01')).toBe(
      "Davr boshi oxiridan keyin bo'lishi mumkin emas",
    );
  });

  it('refuses a start before the floor', () => {
    expect(reject('2026-04-30', '2026-05-31')).toBe(
      "To'lovlar 01.05.2026 dan boshlab ko'rsatiladi",
    );
  });

  it('echoes a month and describes it', () => {
    const p = parsePaymentPeriod('2026-10-01', '2026-10-31');
    expect(p.startStr).toBe('2026-10-01');
    expect(p.endStr).toBe('2026-10-31');
    const { gte, lt } = tashkentRangeUtc('2026-10-01', '2026-10-31');
    expect(p.start).toEqual(gte);
    expect(p.endTs.getTime()).toBe(lt.getTime() - 1);
    expect(periodView(p)).toEqual({
      start: '2026-10-01',
      end: '2026-10-31',
      singleMonth: true,
      endsOnMonthEnd: true,
    });
  });

  it('accepts an end in the future and a range across months', () => {
    const p = parsePaymentPeriod('2026-09-28', '2099-10-04');
    expect(periodView(p)).toEqual({
      start: '2026-09-28',
      end: '2099-10-04',
      singleMonth: false,
      endsOnMonthEnd: false,
    });
  });
});
