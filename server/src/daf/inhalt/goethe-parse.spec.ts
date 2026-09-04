import {
  parseGoetheLines,
  isWordInGoetheA1,
  GOETHE_ZAHLEN,
  GOETHE_WOCHENTAGE,
  GOETHE_MONATE,
  GOETHE_JAHRESZEITEN,
} from './goethe-parse';

describe('parseGoetheLines', () => {
  it('artiklsiz bosh so`zni oladi', () => {
    expect(parseGoetheLines(['aber Ich bin oft im Buero.'])).toEqual([
      { artikel: null, wort: 'aber' },
    ]);
  });

  it('artiklni ajratadi', () => {
    expect(parseGoetheLines(['die Adresse,-en Koennen Sie mir helfen?'])).toEqual([
      { artikel: 'die', wort: 'Adresse' },
    ]);
  });

  it('ko`plik qo`shimchasini tashlaydi', () => {
    const r = parseGoetheLines(['der Absender,- Da ist ein Brief.']);
    expect(r[0].wort).toBe('Absender');
  });

  it('misol gapning davomini so`z deb olmaydi', () => {
    // Ikkinchi satr — birinchi so'zning ikkinchi misoli. Katta harf bilan
    // boshlanadi, lekin bosh so'z emas: undan oldin bo'shliq turadi.
    expect(parseGoetheLines(['abholen Wann kannst du kommen?', '  Wir muessen ihn abholen.'])).toEqual([
      { artikel: null, wort: 'abholen' },
    ]);
  });

  it('sahifa sarlavhasini tashlaydi', () => {
    expect(parseGoetheLines(['VS_02_280312 Seite 9', 'A'])).toEqual([]);
  });

  it('takrorni bir marta qaytaradi', () => {
    const r = parseGoetheLines(['aber Beispiel eins.', 'aber Beispiel zwei.']);
    expect(r).toHaveLength(1);
  });

  it('bitta harfli satrni (alifbo bo`limi) tashlaydi', () => {
    expect(parseGoetheLines(['B'])).toEqual([]);
  });

  it('literature va referenslar bo`limini tashlaydi', () => {
    // "LITerATur" and subsequent reference lines are not vocabulary words
    const result = parseGoetheLines([
      'zwischen Heidelberg liegt zwischen Frankfurt',
      'VS_02_280312 Seite 28',
      'LITerATur',
      'ALTE Handbuch. Europäische Sprachprüfungen',
      'Waystage. Systems development in adult language',
    ]);
    // Only "zwischen" should be extracted; LITerATur and references excluded
    expect(result).toHaveLength(1);
    expect(result[0].wort).toBe('zwischen');
  });

  it('english so`zlarni tashlaydi', () => {
    // English words from book titles/references should not be extracted
    const result = parseGoetheLines([
      'wichtig Das ist sehr wichtig.',
      'objective below Threshold-Level in a European unit/credit',
      'modern language learning by adults',
      'ation with M.A. Fitzpatrick',
    ]);
    // Only "wichtig" is German A1 vocabulary; English words excluded
    expect(result).toHaveLength(1);
    expect(result[0].wort).toBe('wichtig');
  });

  it('referenslar fragmentlarini tashlaydi', () => {
    // Fragments and proper nouns from references section should be excluded
    const result = parseGoetheLines([
      'zusammen Das macht zusammen 2 Euro.',
      'zwischen Heidelberg liegt zwischen Frankfurt und Stuttgart.',
      'Langenscheidt 2001.',
      'Profile Deutsch. Lernzielbestimmungen und nikative Mittel',
      'scheidt with M.A. Fitzpatrick',
    ]);
    // Only real vocabulary words should be extracted
    const words = result.map((w) => w.wort);
    expect(words).toContain('zusammen');
    expect(words).toContain('zwischen');
    expect(words).not.toContain('Langenscheidt');
    expect(words).not.toContain('Profile');
    expect(words).not.toContain('nikative');
    expect(words).not.toContain('scheidt');
  });

  it('articleni bo`shliq bilan ajratadi - "dass", "dies-", "die Adresse"', () => {
    // Article must be followed by whitespace, so "dass" is NOT "das" + "s"
    // and "dies-" is NOT "die" + "s-"
    const result = parseGoetheLines([
      'dass Ich denke, dass es richtig ist.',
      'dies- Welche Farbe magst du? Dies.',
      'die Adresse,-en Können Sie mir helfen?',
    ]);
    const words = result.map((w) => w.wort);
    // All three headwords must be present
    expect(words).toContain('dass');
    expect(words).toContain('dies-');
    expect(words).toContain('Adresse');
    // Check that "s" and "s-" were NOT extracted as garbage
    expect(words).not.toContain('s');
    expect(words).not.toContain('s-');
    // Verify article capture for "die Adresse"
    const addressEntry = result.find((w) => w.wort === 'Adresse');
    expect(addressEntry?.artikel).toBe('die');
    // "dass" and "dies-" should have no article
    const dassEntry = result.find((w) => w.wort === 'dass');
    expect(dassEntry?.artikel).toBeNull();
    const diesEntry = result.find((w) => w.wort === 'dies-');
    expect(diesEntry?.artikel).toBeNull();
  });
});

describe('Goethe A1 Wortgruppen', () => {
  it('zahlen guruhi tadbiq etiladi', () => {
    expect(GOETHE_ZAHLEN).toHaveLength(31);
    expect(GOETHE_ZAHLEN[0].wort).toBe('null');
    expect(GOETHE_ZAHLEN).toContainEqual({ artikel: null, wort: 'zwanzig' });
  });

  it('wochentage guruhi tadbiq etiladi', () => {
    expect(GOETHE_WOCHENTAGE).toHaveLength(7);
    expect(GOETHE_WOCHENTAGE[0]).toEqual({ artikel: 'der', wort: 'Montag' });
  });

  it('monate guruhi tadbiq etiladi', () => {
    expect(GOETHE_MONATE).toHaveLength(12);
    expect(GOETHE_MONATE).toContainEqual({ artikel: 'der', wort: 'Juli' });
  });

  it('jahreszeiten guruhi tadbiq etiladi', () => {
    expect(GOETHE_JAHRESZEITEN).toHaveLength(4);
    expect(GOETHE_JAHRESZEITEN).toContainEqual({ artikel: 'der', wort: 'Sommer' });
  });
});

describe('isWordInGoetheA1 helper', () => {
  const testFile = {
    source: 'test',
    words: parseGoetheLines(['aber Beispiel.']),
    gruppen: {
      zahlen: GOETHE_ZAHLEN,
      wochentage: GOETHE_WOCHENTAGE,
      monate: GOETHE_MONATE,
      jahreszeiten: GOETHE_JAHRESZEITEN,
    },
  };

  it('alifbohla ro`yxatdan so`zni topadi', () => {
    expect(isWordInGoetheA1('aber', testFile)).toBe(true);
  });

  it('zahlar guruhindan so`zni topadi', () => {
    expect(isWordInGoetheA1('zwanzig', testFile)).toBe(true);
  });

  it('oylar guruhindan so`zni topadi', () => {
    expect(isWordInGoetheA1('Juli', testFile)).toBe(true);
  });

  it('o`chgina bo`lmagan so`zni rad etadi', () => {
    expect(isWordInGoetheA1('Kühlschrank', testFile)).toBe(false);
  });

  it('case-insensitive qidiradi', () => {
    expect(isWordInGoetheA1('ABER', testFile)).toBe(true);
    expect(isWordInGoetheA1('juli', testFile)).toBe(true);
  });
});
