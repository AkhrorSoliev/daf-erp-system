import {
  YEAR_PROMPT,
  daysInMonth,
  daysScreen,
  decadeStarts,
  decadesScreen,
  genderScreen,
  isRealIsoDate,
  monthsScreen,
  reviewScreen,
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
  it('G: gender question with cancel', () => {
    const s = genderScreen(7);
    expect(s.text).toBe('Jinsingizni tanlang:');
    expect(labels(s)).toEqual([['👨 Erkak', '👩 Ayol'], ['Bekor qilish']]);
    expect(cbs(s)).toEqual([['pf:g:7:M', 'pf:g:7:F'], ['pf:x:7']]);
  });
  it('1: decades, 2 per row, newest first; back to G only when gender is asked', () => {
    const s = decadesScreen(7, 'M', today);
    expect(s.text).toBe(YEAR_PROMPT);
    expect(YEAR_PROMPT).toBe("Tug'ilgan yilingizni tanlang:");
    expect(labels(s)[0]).toEqual(['2020–2029', '2010–2019']);
    expect(cbs(s)[0]).toEqual(['pf:dd:7:M:2020', 'pf:dd:7:M:2010']);
    expect(
      cbs(s)
        .slice(0, -1)
        .every((r) => r.length <= 2),
    ).toBe(true);
    expect(cbs(s).at(-1)).toEqual(['pf:s:7', 'pf:x:7']);
    const n = decadesScreen(7, 'N', today);
    expect(cbs(n).at(-1)).toEqual(['pf:x:7']);
    expect(labels(n).at(-1)).toEqual(['Bekor qilish']);
  });
  it('2: years 5 per row, back to decades', () => {
    const s = yearsScreen(7, 'F', 1980, today);
    expect(s.text).toBe('Yilni tanlang:');
    expect(cbs(s)[0]).toEqual([
      'pf:dy:7:F:1980',
      'pf:dy:7:F:1981',
      'pf:dy:7:F:1982',
      'pf:dy:7:F:1983',
      'pf:dy:7:F:1984',
    ]);
    expect(cbs(s)[1]).toHaveLength(5);
    expect(cbs(s).at(-1)).toEqual(['pf:dl:7:F', 'pf:x:7']);
    expect(labels(s).at(-1)).toEqual(['⬅️ Orqaga', 'Bekor qilish']);
  });
  it('3: twelve months, 3 per row, back to the decade', () => {
    const s = monthsScreen(7, 'N', 2005);
    expect(s.text).toBe('Oyni tanlang:');
    expect(labels(s).slice(0, 4)).toEqual([
      ['Yanvar', 'Fevral', 'Mart'],
      ['Aprel', 'May', 'Iyun'],
      ['Iyul', 'Avgust', 'Sentabr'],
      ['Oktabr', 'Noyabr', 'Dekabr'],
    ]);
    expect(cbs(s)[2][0]).toBe('pf:dm:7:N:2005-07');
    expect(cbs(s).at(-1)).toEqual(['pf:dd:7:N:2000', 'pf:x:7']);
  });
  it('4: days of the month, leap aware, 7 per row, back to months', () => {
    const feb = daysScreen(7, 'M', 2004, 2);
    const days = (s: Screen) => flat(s).filter((c) => c.startsWith('pf:dc:'));
    expect(days(feb)).toHaveLength(29);
    expect(days(daysScreen(7, 'M', 2005, 2))).toHaveLength(28);
    expect(feb.text).toBe('Kunni tanlang:');
    expect(cbs(feb)[0]).toHaveLength(7);
    expect(cbs(feb)[0][0]).toBe('pf:dc:7:M:2004-02-01');
    expect(cbs(feb).at(-1)).toEqual(['pf:dy:7:M:2004', 'pf:x:7']);
  });
  it('5: review with both lines', () => {
    const s = reviewScreen(7, 'F', '2005-03-15');
    expect(s.text).toBe(
      "Tekshirib ko'ring:\n\nJins: Ayol\nTug'ilgan sana: 15-mart, 2005\n\nHammasi to'g'rimi?",
    );
    expect(cbs(s)[0]).toEqual(['pf:ds:7:F:2005-03-15', 'pf:s:7']);
    expect(labels(s)[0]).toEqual(['✅ Ha, saqlash', '↩️ Qaytadan']);
    expect(cbs(s).at(-1)).toEqual(['pf:dm:7:F:2005-03', 'pf:x:7']);
  });
  it('5: review without a gender line (g = N) or without a date', () => {
    expect(reviewScreen(7, 'N', '2005-03-05').text).toBe(
      "Tekshirib ko'ring:\n\nTug'ilgan sana: 5-mart, 2005\n\nHammasi to'g'rimi?",
    );
    const g = reviewScreen(7, 'M', null);
    expect(g.text).toBe(
      "Tekshirib ko'ring:\n\nJins: Erkak\n\nHammasi to'g'rimi?",
    );
    expect(cbs(g)[0]).toEqual(['pf:ds:7:M:-', 'pf:s:7']);
    expect(cbs(g).at(-1)).toEqual(['pf:s:7', 'pf:x:7']);
  });
  it('every callback stays under 64 bytes for the largest id', () => {
    const big = 2147483647;
    const screens = [
      genderScreen(big),
      decadesScreen(big, 'M', today),
      yearsScreen(big, 'M', 1980, today),
      monthsScreen(big, 'M', 2005),
      daysScreen(big, 'M', 2005, 12),
      reviewScreen(big, 'M', '2005-12-31'),
      reviewScreen(big, 'M', null),
    ];
    for (const s of screens)
      for (const c of flat(s))
        expect(Buffer.byteLength(c)).toBeLessThanOrEqual(64);
  });
});
