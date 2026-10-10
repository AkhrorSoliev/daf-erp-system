import { normalisieren, tippfehler } from './antwort';
import {
  gleicheUhr,
  informell,
  kanonisch,
  offiziell,
  parseZeit,
  sprechtext,
  uhrAntworten,
  zahlwort,
} from './uhrzeit-text';

describe('zahlwort', () => {
  it.each([
    [0, 'null'],
    [1, 'eins'],
    [7, 'sieben'],
    [11, 'elf'],
    [12, 'zwölf'],
    [16, 'sechzehn'],
    [17, 'siebzehn'],
    [20, 'zwanzig'],
    [21, 'einundzwanzig'],
    [26, 'sechsundzwanzig'],
    [27, 'siebenundzwanzig'],
    [30, 'dreißig'],
    [45, 'fünfundvierzig'],
    [59, 'neunundfünfzig'],
  ])('%i → %s', (n, wort) => {
    expect(zahlwort(n)).toBe(wort);
  });

  it('refuses numbers outside 0–59', () => {
    expect(() => zahlwort(60)).toThrow();
    expect(() => zahlwort(-1)).toThrow();
    expect(() => zahlwort(1.5)).toThrow();
  });
});

describe('parseZeit', () => {
  it('reads HH:MM', () => {
    expect(parseZeit('03:30')).toEqual({ h: 3, m: 30 });
    expect(parseZeit('15:05')).toEqual({ h: 15, m: 5 });
    expect(parseZeit('00:00')).toEqual({ h: 0, m: 0 });
  });

  it.each(['3:30', '24:00', '12:60', '03-30', '', 'ab:cd', '03:3'])(
    'refuses %p',
    (s) => {
      expect(parseZeit(s)).toBeNull();
    },
  );
});

describe('informell — the first form is the one taught and spoken', () => {
  it.each([
    [3, 0, 'drei Uhr'],
    [1, 0, 'ein Uhr'],
    [3, 5, 'fünf nach drei'],
    [3, 10, 'zehn nach drei'],
    [3, 15, 'Viertel nach drei'],
    [3, 20, 'zwanzig nach drei'],
    [3, 25, 'fünf vor halb vier'],
    [3, 30, 'halb vier'],
    [3, 35, 'fünf nach halb vier'],
    [3, 40, 'zwanzig vor vier'],
    [3, 45, 'Viertel vor vier'],
    [3, 50, 'zehn vor vier'],
    [3, 55, 'fünf vor vier'],
    // «halb» names the NEXT hour, and after twelve comes one.
    [12, 30, 'halb eins'],
    [12, 45, 'Viertel vor eins'],
    [1, 5, 'fünf nach eins'],
    // A 24-hour time is told on the 12-hour clock.
    [15, 30, 'halb vier'],
    [0, 0, 'zwölf Uhr'],
    [0, 30, 'halb eins'],
    [23, 55, 'fünf vor zwölf'],
  ])('%i:%i → %s', (h, m, text) => {
    expect(informell(h, m)[0]).toBe(text);
  });

  it('accepts both standard ways for :20 and :40', () => {
    expect(informell(3, 20)).toContain('zehn vor halb vier');
    expect(informell(3, 40)).toContain('zehn nach halb vier');
  });

  it('accepts the bare hour at o’clock, «eins» for one', () => {
    expect(informell(3, 0)).toContain('drei');
    expect(informell(1, 0)).toContain('eins');
    expect(informell(1, 0)).not.toContain('ein');
  });

  it('accepts the regional quarter forms', () => {
    expect(informell(3, 15)).toContain('viertel vier');
    expect(informell(3, 45)).toContain('drei viertel vier');
    expect(informell(3, 45)).toContain('dreiviertel vier');
  });

  it('refuses a minute that is not a five', () => {
    expect(() => informell(3, 7)).toThrow();
  });
});

describe('offiziell', () => {
  it.each([
    [3, 0, 'drei Uhr'],
    [3, 30, 'drei Uhr dreißig'],
    [15, 15, 'fünfzehn Uhr fünfzehn'],
    [1, 5, 'ein Uhr fünf'],
    [13, 0, 'dreizehn Uhr'],
    [0, 0, 'null Uhr'],
    [0, 30, 'null Uhr dreißig'],
    [12, 0, 'zwölf Uhr'],
    [21, 45, 'einundzwanzig Uhr fünfundvierzig'],
    [7, 1, 'sieben Uhr eins'],
  ])('%i:%i → %s', (h, m, text) => {
    expect(offiziell(h, m)).toBe(text);
  });
});

describe('kanonisch / gleicheUhr', () => {
  it('writes the clock face time with hours 1–12', () => {
    expect(kanonisch(3, 30)).toBe('03:30');
    expect(kanonisch(15, 30)).toBe('03:30');
    expect(kanonisch(0, 5)).toBe('12:05');
    expect(kanonisch(12, 0)).toBe('12:00');
  });

  it('compares two times on the clock face', () => {
    expect(gleicheUhr({ h: 3, m: 30 }, { h: 15, m: 30 })).toBe(true);
    expect(gleicheUhr({ h: 0, m: 0 }, { h: 12, m: 0 })).toBe(true);
    expect(gleicheUhr({ h: 3, m: 30 }, { h: 4, m: 30 })).toBe(false);
  });
});

describe('sprechtext', () => {
  it('says the informal form in a sentence', () => {
    expect(sprechtext(3, 30)).toBe('Es ist halb vier.');
    expect(sprechtext(3, 0)).toBe('Es ist drei Uhr.');
  });
});

describe('uhrAntworten — what a typed answer may be', () => {
  it('3:30 — informal, official 12h and 24h, with or without «Es ist»', () => {
    const { richtig, akzeptiert } = uhrAntworten(3, 30);
    expect(richtig).toBe('halb vier');
    expect(akzeptiert).toEqual(
      expect.arrayContaining([
        'drei Uhr dreißig',
        'fünfzehn Uhr dreißig',
        'Es ist halb vier',
        'Es ist drei Uhr dreißig',
      ]),
    );
    expect(akzeptiert).not.toContain(richtig);
  });

  it('12:00 — noon and midnight are both on the face', () => {
    const { akzeptiert } = uhrAntworten(12, 0);
    expect(akzeptiert).toEqual(
      expect.arrayContaining([
        'zwölf',
        'null Uhr',
        'vierundzwanzig Uhr',
        'Mittag',
        'Mitternacht',
      ]),
    );
  });

  it('12:30 — «zwölf Uhr dreißig» and «null Uhr dreißig»', () => {
    const { richtig, akzeptiert } = uhrAntworten(12, 30);
    expect(richtig).toBe('halb eins');
    expect(akzeptiert).toEqual(
      expect.arrayContaining(['zwölf Uhr dreißig', 'null Uhr dreißig']),
    );
  });

  it.each([
    [5, 50, 'zehn Minuten vor sechs'],
    [1, 5, 'fünf Minuten nach eins'],
    [4, 20, 'zwanzig Minuten nach vier'],
    [3, 35, 'fünfundzwanzig Minuten vor vier'],
    [3, 25, 'fünfundzwanzig Minuten nach drei'],
    [3, 40, 'zwanzig Minuten vor vier'],
    [3, 55, 'fünf Minuten vor vier'],
    [3, 10, 'zehn Minuten nach drei'],
  ])('%i:%i — accepts «%s»', (h, m, text) => {
    const { akzeptiert } = uhrAntworten(h, m);
    expect(akzeptiert).toContain(text);
    expect(akzeptiert).toContain(`Es ist ${text}`);
  });

  it('no «Minuten» form with «halb» or «Viertel»', () => {
    for (let m = 0; m < 60; m += 5) {
      const { akzeptiert } = uhrAntworten(3, m);
      const falsch = akzeptiert.filter(
        (f) => f.includes('Minuten') && /halb|viertel/i.test(f),
      );
      expect(falsch).toEqual([]);
    }
  });

  it('has no duplicate', () => {
    const { richtig, akzeptiert } = uhrAntworten(12, 0);
    const alle = [richtig, ...akzeptiert].map(normalisieren);
    expect(new Set(alle).size).toBe(alle.length);
  });
});

/**
 * The CEO rule from both sides: a correct answer is never wrong, and a
 * wrong time is never right. Every five-minute time of the clock face is
 * checked against every other.
 */
describe('no answer fits two times', () => {
  const zeiten: Array<[number, number]> = [];
  for (let h = 1; h <= 12; h += 1) {
    for (let m = 0; m < 60; m += 5) zeiten.push([h, m]);
  }
  const formen = (h: number, m: number): string[] => {
    const { richtig, akzeptiert } = uhrAntworten(h, m);
    return [richtig, ...akzeptiert];
  };

  it('includes the «Minuten» forms in the check', () => {
    const alle = zeiten.flatMap(([h, m]) => formen(h, m));
    expect(alle.filter((f) => /^\S+ Minuten (nach|vor) /.test(f))).toHaveLength(
      12 * 8,
    );
  });

  it('every accepted form names exactly one time', () => {
    const besitzer = new Map<string, string>();
    for (const [h, m] of zeiten) {
      for (const f of formen(h, m)) {
        const k = normalisieren(f);
        const vorher = besitzer.get(k);
        expect(vorher === undefined || vorher === kanonisch(h, m)).toBe(true);
        besitzer.set(k, kanonisch(h, m));
      }
    }
  });

  it('no form of one time is one slip from a form of another', () => {
    const basis = (h: number, m: number) =>
      formen(h, m).filter((f) => !f.startsWith('Es ist'));
    const kollision: string[] = [];
    for (const [h, m] of zeiten) {
      const eigene = basis(h, m);
      for (const [h2, m2] of zeiten) {
        if (h === h2 && m === m2) continue;
        for (const f of basis(h2, m2)) {
          if (tippfehler(f, eigene)) {
            kollision.push(`${f} ~ ${kanonisch(h, m)}`);
          }
        }
      }
    }
    expect(kollision).toEqual([]);
  });
});
