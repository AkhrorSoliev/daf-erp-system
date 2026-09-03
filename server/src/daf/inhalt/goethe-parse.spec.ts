import {
  parseGoetheLines,
  isWordInGoetheA1,
  GOETHE_ZAHLEN,
  GOETHE_WOCHENTAGE,
  GOETHE_MONATE,
  GOETHE_JAHRESZEITEN,
  GOETHE_ZIFFER_ZU_WORT,
} from './goethe-parse';
import type { GoetheFile } from './goethe-parse';

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

describe('GOETHE_ZIFFER_ZU_WORT — raqam-so`z moslashuvining o`zi', () => {
  it('0 dan 20 gacha har bir raqam uchun to`g`ri nemischa so`zni saqlaydi', () => {
    expect(GOETHE_ZIFFER_ZU_WORT.get('0')).toBe('null');
    expect(GOETHE_ZIFFER_ZU_WORT.get('1')).toBe('eins');
    expect(GOETHE_ZIFFER_ZU_WORT.get('9')).toBe('neun');
    expect(GOETHE_ZIFFER_ZU_WORT.get('10')).toBe('zehn');
    expect(GOETHE_ZIFFER_ZU_WORT.get('12')).toBe('zwölf');
    expect(GOETHE_ZIFFER_ZU_WORT.get('13')).toBe('dreizehn');
    expect(GOETHE_ZIFFER_ZU_WORT.get('18')).toBe('achtzehn');
    expect(GOETHE_ZIFFER_ZU_WORT.get('20')).toBe('zwanzig');
  });

  it('aynan 21 ta yozuv (0-20) saqlaydi', () => {
    expect(GOETHE_ZIFFER_ZU_WORT.size).toBe(21);
  });

  it('21 dan katta raqam uchun moslashuv yo`q', () => {
    expect(GOETHE_ZIFFER_ZU_WORT.get('21')).toBeUndefined();
  });
});

describe('isWordInGoetheA1 — raqam ko`rinishi (ziffer)', () => {
  const goetheAsl: GoetheFile = {
    source: 'test',
    words: [],
    gruppen: {
      zahlen: GOETHE_ZAHLEN,
      wochentage: [],
      monate: [],
      jahreszeiten: [],
    },
  };

  it('"0"dan "20"gacha har biri gruppen.zahlen orqali topiladi', () => {
    for (let n = 0; n <= 20; n++) {
      expect(isWordInGoetheA1(String(n), goetheAsl)).toBe(true);
    }
  });

  it('moslashuvda yo`q raqamni rad etadi (21 dan katta)', () => {
    expect(isWordInGoetheA1('25', goetheAsl)).toBe(false);
  });

  it('gruppen umuman bo`lmasa raqamni rad etadi', () => {
    const goetheGruppensiz: GoetheFile = { source: 'test', words: [] };
    expect(isWordInGoetheA1('5', goetheGruppensiz)).toBe(false);
  });

  it('gruppen.zahlen kutilgan so`zni saqlamasa — RAD ETADI (index emas, QIYMAT tekshiriladi)', () => {
    // Bu aynan avvalgi index-asosli "enrichment" xatosini ushlaydi: agar
    // birov gruppen.zahlen'ni tartibini o'zgartirsa yoki qisqartirsa,
    // "13" endi noto'g'ri so'zga (yoki hech narsaga) mos kelib qolishi
    // kerak — index bo'yicha "to'g'ri" deb hisoblanmasligi kerak.
    const qisqartirilgan: GoetheFile = {
      source: 'test',
      words: [],
      gruppen: {
        // Faqat 0-12 saqlangan — "13" (dreizehn) endi yo'q.
        zahlen: GOETHE_ZAHLEN.slice(0, 13),
        wochentage: [],
        monate: [],
        jahreszeiten: [],
      },
    };
    expect(isWordInGoetheA1('13', qisqartirilgan)).toBe(false);
    // 0-12 hali ham to'g'ri topiladi.
    expect(isWordInGoetheA1('12', qisqartirilgan)).toBe(true);

    // Qayta tartiblangan massiv: index 13'da endi "dreizehn" emas,
    // "zwanzig" turibdi. Index-asosli yechim buni "13" deb noto'g'ri
    // qabul qilardi; qiymat-asosli yechim rad etadi.
    const qaytaTartiblangan: GoetheFile = {
      source: 'test',
      words: [],
      gruppen: {
        zahlen: [
          ...GOETHE_ZAHLEN.slice(0, 13),
          { artikel: null, wort: 'zwanzig' }, // index 13'da "dreizehn" o'rniga
          ...GOETHE_ZAHLEN.slice(14),
        ],
        wochentage: [],
        monate: [],
        jahreszeiten: [],
      },
    };
    expect(isWordInGoetheA1('13', qaytaTartiblangan)).toBe(false);
    // "zwanzig" so'zining o'zi hali ham (boshqa index'da bo'lsa ham) bor,
    // shuning uchun "20" to'g'ri topiladi — qiymat qidirilgani uchun.
    expect(isWordInGoetheA1('20', qaytaTartiblangan)).toBe(true);
  });
});
