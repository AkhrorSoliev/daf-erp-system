import {
  YEAR_PROMPT,
  confirmScreen,
  daysInMonth,
  daysScreen,
  decadeStarts,
  decadesScreen,
  isRealIsoDate,
  monthsScreen,
  validYearRange,
  yearsOfDecade,
  yearsScreen,
} from './profile-date-picker';

const today = '2026-10-25';
type Screen = { keyboard: { reply_markup: { inline_keyboard: any[][] } } };
const cbs = (s: Screen) =>
  s.keyboard.reply_markup.inline_keyboard.map((r) =>
    r.map((b: any) => b.callback_data),
  );
const labels = (s: Screen) =>
  s.keyboard.reply_markup.inline_keyboard.map((r) => r.map((b: any) => b.text));
const flat = (s: Screen) => cbs(s).flat();

describe('year ranges', () => {
  it('uses today minus max/min age', () => {
    expect(validYearRange(today)).toEqual({ min: 1926, max: 2021 });
  });
  it('lists decades newest first', () => {
    expect(decadeStarts(today)).toEqual([
      2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950, 1940, 1930, 1920,
    ]);
  });
  it('clips years of edge decades to the valid range', () => {
    expect(yearsOfDecade(today, 2020)).toEqual([2020, 2021]);
    expect(yearsOfDecade(today, 1920)).toEqual([1926, 1927, 1928, 1929]);
    expect(yearsOfDecade(today, 1980)).toHaveLength(10);
    expect(yearsOfDecade(today, 2030)).toEqual([]);
  });
});

describe('calendar helpers', () => {
  it('knows leap years', () => {
    expect(daysInMonth(2004, 2)).toBe(29);
    expect(daysInMonth(2005, 2)).toBe(28);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2005, 4)).toBe(30);
    expect(daysInMonth(2005, 12)).toBe(31);
  });
  it('rejects impossible and malformed dates', () => {
    expect(isRealIsoDate('2005-02-30')).toBe(false);
    expect(isRealIsoDate('2005-13-01')).toBe(false);
    expect(isRealIsoDate('2005-3-01')).toBe(false);
    expect(isRealIsoDate('2004-02-29')).toBe(true);
  });
});

describe('screens', () => {
  it('1: decades, 2 per row, newest first, cancel only', () => {
    const s = decadesScreen(7, today);
    expect(s.text).toBe(YEAR_PROMPT);
    expect(YEAR_PROMPT).toBe("Tug'ilgan yilingizni tanlang:");
    expect(labels(s)[0]).toEqual(['2020–2029', '2010–2019']);
    expect(cbs(s)[0]).toEqual(['pf:dd:7:2020', 'pf:dd:7:2010']);
    expect(
      cbs(s)
        .slice(0, -1)
        .every((r) => r.length <= 2),
    ).toBe(true);
    expect(cbs(s).at(-1)).toEqual(['pf:x:7']);
    expect(labels(s).at(-1)).toEqual(['Bekor qilish']);
  });
  it('2: years 5 per row, back to decades', () => {
    const s = yearsScreen(7, 1980, today);
    expect(s.text).toBe('Yilni tanlang:');
    expect(cbs(s)[0]).toEqual([
      'pf:dy:7:1980',
      'pf:dy:7:1981',
      'pf:dy:7:1982',
      'pf:dy:7:1983',
      'pf:dy:7:1984',
    ]);
    expect(cbs(s)[1]).toHaveLength(5);
    expect(cbs(s).at(-1)).toEqual(['pf:d:7', 'pf:x:7']);
    expect(labels(s).at(-1)).toEqual(['⬅️ Orqaga', 'Bekor qilish']);
  });
  it('3: twelve months, 3 per row, back to the decade', () => {
    const s = monthsScreen(7, 2005);
    expect(s.text).toBe('Oyni tanlang:');
    expect(labels(s).slice(0, 4)).toEqual([
      ['Yanvar', 'Fevral', 'Mart'],
      ['Aprel', 'May', 'Iyun'],
      ['Iyul', 'Avgust', 'Sentabr'],
      ['Oktabr', 'Noyabr', 'Dekabr'],
    ]);
    expect(cbs(s)[2][0]).toBe('pf:dm:7:2005-07');
    expect(cbs(s).at(-1)).toEqual(['pf:dd:7:2000', 'pf:x:7']);
  });
  it('4: days of the month, leap aware, 7 per row, back to months', () => {
    const feb = daysScreen(7, 2004, 2);
    const days = (s: Screen) => flat(s).filter((c) => c.startsWith('pf:dc:'));
    expect(days(feb)).toHaveLength(29);
    expect(days(daysScreen(7, 2005, 2))).toHaveLength(28);
    expect(feb.text).toBe('Kunni tanlang:');
    expect(cbs(feb)[0]).toHaveLength(7);
    expect(cbs(feb)[0][0]).toBe('pf:dc:7:2004-02-01');
    expect(cbs(feb).at(-1)).toEqual(['pf:dy:7:2004', 'pf:x:7']);
  });
  it('5: confirm text and buttons', () => {
    const s = confirmScreen(7, '2005-03-15');
    expect(s.text).toBe("Tug'ilgan sana: 15-mart, 2005. To'g'rimi?");
    expect(cbs(s)[0]).toEqual(['pf:ds:7:2005-03-15', 'pf:d:7']);
    expect(labels(s)[0]).toEqual(['✅ Ha, saqlash', '↩️ Qaytadan']);
    expect(cbs(s).at(-1)).toEqual(['pf:dm:7:2005-03', 'pf:x:7']);
    expect(confirmScreen(7, '2005-03-05').text).toContain('5-mart');
  });
  it('every callback stays under 64 bytes for the largest id', () => {
    const big = 2147483647;
    const screens = [
      decadesScreen(big, today),
      yearsScreen(big, 1980, today),
      monthsScreen(big, 2005),
      daysScreen(big, 2005, 12),
      confirmScreen(big, '2005-12-31'),
    ];
    for (const s of screens)
      for (const c of flat(s))
        expect(Buffer.byteLength(c)).toBeLessThanOrEqual(64);
  });
});
