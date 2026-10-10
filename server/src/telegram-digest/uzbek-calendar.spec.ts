import {
  capitalizeUz,
  formatDigestDate,
  fullWeekdaysLabel,
  previousMonth,
  shortWeekdaysLabel,
  uzMonthName,
} from './uzbek-calendar';

describe('uzbek-calendar', () => {
  it('names every month in Latin Uzbek, lower case', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(uzMonthName)).toEqual([
      'yanvar',
      'fevral',
      'mart',
      'aprel',
      'may',
      'iyun',
      'iyul',
      'avgust',
      'sentabr',
      'oktabr',
      'noyabr',
      'dekabr',
    ]);
  });

  it('refuses a month outside 1–12', () => {
    expect(() => uzMonthName(0)).toThrow(RangeError);
    expect(() => uzMonthName(13)).toThrow(RangeError);
  });

  it('builds the forms the approved texts use', () => {
    expect(`${capitalizeUz(uzMonthName(10))} oyi uchun to'lov`).toBe(
      "Oktabr oyi uchun to'lov",
    );
    expect(`${capitalizeUz(uzMonthName(9))}dagi`).toBe('Sentabrdagi');
    expect(`${capitalizeUz(uzMonthName(9))}dan qolgan qarz`).toBe(
      'Sentabrdan qolgan qarz',
    );
    expect(`${uzMonthName(10)}ning 2-darsi`).toBe('oktabrning 2-darsi');
  });

  it('steps back across the new year', () => {
    expect(previousMonth(2026, 10)).toEqual({ year: 2026, month: 9 });
    expect(previousMonth(2027, 1)).toEqual({ year: 2026, month: 12 });
  });

  it('formats a digest date as DD.MM.YYYY', () => {
    expect(formatDigestDate('2026-10-05')).toBe('05.10.2026');
  });

  it('labels group days in week order, whatever order and case they are stored in', () => {
    expect(shortWeekdaysLabel(['friday', 'Monday', ' wednesday '])).toBe(
      'Du, Cho, Ju',
    );
    expect(shortWeekdaysLabel(['saturday', 'tuesday', 'thursday'])).toBe(
      'Se, Pa, Sha',
    );
    expect(shortWeekdaysLabel(['sunday'])).toBe('Ya');
  });

  it('gives an empty label for no or unknown days', () => {
    expect(shortWeekdaysLabel([])).toBe('');
    expect(shortWeekdaysLabel(['someday'])).toBe('');
  });

  it('writes exactDays as full day names for documents, Monday first', () => {
    expect(fullWeekdaysLabel(['friday', 'Monday', ' wednesday '])).toBe(
      'Dushanba, Chorshanba, Juma',
    );
    expect(fullWeekdaysLabel(['sunday', 'saturday'])).toBe('Shanba, Yakshanba');
    expect(fullWeekdaysLabel([])).toBe('');
    expect(fullWeekdaysLabel(['someday'])).toBe('');
  });
});
