import { promiseDayEnd } from '../../src/payment-promises/promise-rule';
import { legacyPromiseDay } from './promise-legacy-day';

describe('legacyPromiseDay — the day a stored promise meant', () => {
  it.each([
    ['2026-06-28T00:00:00.000Z', 'payment dialog YYYY-MM-DD'],
    ['2026-06-28T18:00:00.000Z', 'drawer / call dialog 23:00 Tashkent'],
    ['2026-06-28T18:59:59.000Z', 'old dialog, UTC+5 browser'],
    [
      '2026-06-28T20:59:59.000Z',
      'old dialog, UTC+3 browser (29.06 01:59 Tashkent)',
    ],
    ['2026-06-28T21:59:59.000Z', 'old dialog, UTC+2 browser'],
    ['2026-06-28T18:59:59.999Z', 'already normalised'],
  ])('%s (%s) means 28.06', (stored) => {
    expect(legacyPromiseDay(new Date(stored))).toBe('2026-06-28');
  });

  it('a time of day no writer produced is not guessed', () => {
    expect(legacyPromiseDay(new Date('2026-06-28T07:13:00.000Z'))).toBeNull();
  });

  it('a normalised row reads back as the same row, so a second run changes nothing', () => {
    const end = promiseDayEnd('2026-06-28');
    expect(promiseDayEnd(legacyPromiseDay(end)!)).toEqual(end);
  });
});
