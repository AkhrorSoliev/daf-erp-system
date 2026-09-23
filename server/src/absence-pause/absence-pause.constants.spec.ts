import { formatTashkentDate } from './absence-pause.constants';

describe('formatTashkentDate', () => {
  it.each([
    // A `@db.Date` value arrives as UTC midnight and prints as its own day.
    ['2026-09-19T00:00:00.000Z', '19.09.2026'],
    // 19:00 UTC is 00:00 in Tashkent (UTC+5): the next day, here the next year.
    ['2026-12-31T19:00:00.000Z', '01.01.2027'],
    ['2026-12-31T18:59:59.999Z', '31.12.2026'],
  ])('%s → %s', (iso, expected) => {
    expect(formatTashkentDate(new Date(iso))).toBe(expected);
  });
});
