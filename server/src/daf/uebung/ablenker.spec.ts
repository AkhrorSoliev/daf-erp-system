import {
  bedeutungUeberlappt,
  istBuchstabe,
  waehleAblenker,
  wortArt,
  zahlenFalle,
} from './ablenker';
import type { MaterialWort } from './frage.types';

function w(
  id: number,
  de: string,
  uz: string,
  extra: Partial<MaterialWort> = {},
): MaterialWort {
  return {
    id,
    de,
    uz,
    artikel: null,
    anzeige: null,
    sectionCode: 'u01-s1',
    audioKey: null,
    ...extra,
  };
}

const rnd = (): number => 0;

describe('wortArt', () => {
  it.each([
    [w(1, 'C', "'C' harfi"), 'BUCHSTABE'],
    [w(2, 'drei', 'uch', { anzeige: '3' }), 'ZAHL'],
    [w(3, 'Bahnhof', 'vokzal', { artikel: 'der' }), 'NOMEN'],
    [w(4, 'wohnen', 'yashamoq'), 'VERB'],
    [w(5, 'gehen', 'yurmoq (piyoda bormoq)'), 'VERB'],
    [w(6, 'Guten Morgen', 'xayrli tong'), 'PHRASE'],
    [w(7, 'links', 'chapda, chapga'), 'SONST'],
  ])('%o is %s', (wort, art) => {
    expect(wortArt(wort)).toBe(art);
  });

  it('a letter is a single letter only', () => {
    expect(istBuchstabe(w(1, 'Ä', "'Ä' harfi"))).toBe(true);
    expect(istBuchstabe(w(2, 'du', 'sen'))).toBe(false);
  });
});

describe('bedeutungUeberlappt — never a second right answer', () => {
  it.each([
    ["o'qituvchi", "o'qituvchi ayol"],
    ["o'g'il", "o'g'il bola"],
    ['qiz', 'qiz bola'],
    ['-da (joy predlogi)', '-da, oldida (joy predlogi)'],
    ['xayr (norasmiy)', 'xayr (rasmiy)'],
    ['uzoq (masofa)', 'uzoq (vaqt)'],
  ])('%s and %s overlap', (a, b) => {
    expect(bedeutungUeberlappt(a, b)).toBe(true);
    expect(bedeutungUeberlappt(b, a)).toBe(true);
  });

  it.each([
    ['ota', 'ona'],
    ['vokzal', 'pochta'],
    ['chapda, chapga', "o'ngda, o'ngga"],
  ])('%s and %s do not', (a, b) => {
    expect(bedeutungUeberlappt(a, b)).toBe(false);
  });
});

describe('zahlenFalle — the German number traps', () => {
  it.each([
    [35, 53],
    [13, 30],
    [70, 17],
    [7, 17],
    [19, 9],
  ])('%i and %i are a trap', (a, b) => {
    expect(zahlenFalle(a, b)).toBe(true);
  });

  it.each([
    [7, 8],
    [33, 33],
    [12, 20],
    [4, 40],
  ])('%i and %i are not', (a, b) => {
    expect(zahlenFalle(a, b)).toBe(false);
  });
});

describe('waehleAblenker — numbers', () => {
  // The Uzbek meanings as the content writes them: "o'n yetti" contains
  // "yetti", which must not count as a second right answer for "sieben".
  const BIRLAR = [
    'nol',
    'bir',
    'ikki',
    'uch',
    "to'rt",
    'besh',
    'olti',
    'yetti',
    'sakkiz',
    "to'qqiz",
  ];
  const DE = [
    'null',
    'eins',
    'zwei',
    'drei',
    'vier',
    'fünf',
    'sechs',
    'sieben',
    'acht',
    'neun',
    'zehn',
    'elf',
    'zwölf',
    'dreizehn',
    'vierzehn',
    'fünfzehn',
    'sechzehn',
    'siebzehn',
    'achtzehn',
    'neunzehn',
  ];
  const u01 = DE.map((de, n) =>
    w(
      100 + n,
      de,
      n < 10 ? BIRLAR[n] : n === 10 ? "o'n" : `o'n ${BIRLAR[n - 10]}`,
      {
        anzeige: String(n),
      },
    ),
  );
  const u02 = [
    ['zwanzig', 'yigirma', 20],
    ['dreißig', "o'ttiz", 30],
    ['vierzig', 'qirq', 40],
    ['fünfzig', 'ellik', 50],
    ['sechzig', 'oltmish', 60],
    ['siebzig', 'yetmish', 70],
    ['achtzig', 'sakson', 80],
    ['neunzig', "to'qson", 90],
    ['hundert', 'yuz', 100],
    ['einundzwanzig', 'yigirma bir', 21],
    ['fünfunddreißig', "o'ttiz besh", 35],
    ['achtundvierzig', 'qirq sakkiz', 48],
    ['neunundneunzig', "to'qson to'qqiz", 99],
  ].map(([de, uz, n]) =>
    w(200 + Number(n), String(de), String(uz), { anzeige: String(n) }),
  );

  // Deterministic stand-in for Math.random, so every seed is reproducible.
  function prng(seed: number): () => number {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const FORMATE = [
    {
      name: 'WORT_UZ',
      feld: (x: MaterialWort) => x.uz,
      aehnlich: false,
      bedeutung: true,
    },
    {
      name: 'UZ_WORT',
      feld: (x: MaterialWort) => x.de,
      aehnlich: true,
      bedeutung: true,
    },
    {
      name: 'AUDIO_WORT',
      feld: (x: MaterialWort) => x.de,
      aehnlich: true,
      bedeutung: false,
    },
  ];

  it.each(FORMATE)('$name: seven always stands next to seventeen', (f) => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const got = waehleAblenker(u01[7], u01, { ...f, rnd: prng(seed) })!;
      expect(got.map((x) => x.anzeige)).toContain('17');
      expect(got).toHaveLength(3);
    }
  });

  it.each(FORMATE)(
    '$name: the traps never point at the answer — every option has as many as the answer',
    (f) => {
      // Review 2026-09-30: "dreißig" always came with 20 and 40, and 7 with
      // 17 beside two unrelated numbers — the answer was the one the traps
      // gathered around, with no German at all (blind guessing 48–60%).
      for (const pool of [u01, u02, [...u01, ...u02]]) {
        for (const ziel of pool) {
          for (let seed = 1; seed <= 30; seed += 1) {
            const got = waehleAblenker(ziel, pool, { ...f, rnd: prng(seed) })!;
            const set = [ziel, ...got].map((x) => Number(x.anzeige));
            const grad = set.map(
              (a) => set.filter((b) => b !== a && zahlenFalle(a, b)).length,
            );
            expect(new Set(grad).size).toBe(1);
          }
        }
      }
    },
  );

  it.each(FORMATE)(
    '$name: no option is the only one of its shape (one digit, teen, round, compound)',
    (f) => {
      // Review 2026-09-30: in u02 a lone compound (35 among 20, 70, 90) was
      // always the answer — 21, 35, 48 and 99 have no trap among 20–100.
      const form = (n: number) =>
        n < 10 ? 'E' : n < 20 ? 'Z' : n % 10 === 0 ? 'R' : 'K';
      for (const pool of [u01, u02, [...u01, ...u02]]) {
        for (const ziel of pool) {
          for (let seed = 1; seed <= 30; seed += 1) {
            const got = waehleAblenker(ziel, pool, { ...f, rnd: prng(seed) })!;
            const formen = [ziel, ...got].map((x) => form(Number(x.anzeige)));
            for (const fo of formen) {
              expect(formen.filter((x) => x === fo).length).toBeGreaterThan(1);
            }
          }
        }
      }
    },
  );
});

describe('waehleAblenker', () => {
  const zahlen = [
    w(10, 'drei', 'uch', { anzeige: '3' }),
    w(11, 'dreißig', "o'ttiz", { anzeige: '30' }),
    w(12, 'vier', "to'rt", { anzeige: '4' }),
    w(13, 'vierzig', 'qirq', { anzeige: '40' }),
    w(14, 'acht', 'sakkiz', { anzeige: '8' }),
  ];
  const anderes = [
    w(20, 'hallo', 'salom'),
    w(21, 'danke', 'rahmat'),
    w(22, 'Bahnhof', 'vokzal', { artikel: 'der' }),
  ];

  it('prefers words of the same kind', () => {
    const r = waehleAblenker(zahlen[0], [...anderes, ...zahlen], {
      feld: (x) => x.uz,
      aehnlich: false,
      bedeutung: true,
      rnd,
    })!;
    expect(r.every((x) => wortArt(x) === 'ZAHL')).toBe(true);
    expect(r).toHaveLength(3);
  });

  it('with aehnlich, puts the look-alike first (drei → dreißig)', () => {
    for (const seed of [0, 0.3, 0.7, 0.99]) {
      const r = waehleAblenker(zahlen[0], [...zahlen, ...anderes], {
        feld: (x) => x.de,
        aehnlich: true,
        bedeutung: false,
        rnd: () => seed,
        fenster: 1,
      })!;
      expect(r.map((x) => x.de)).toContain('dreißig');
    }
  });

  it('fills from other kinds when the kind is too small', () => {
    const r = waehleAblenker(anderes[2], [...anderes, zahlen[0], zahlen[2]], {
      feld: (x) => x.uz,
      aehnlich: false,
      bedeutung: true,
      rnd,
    })!;
    expect(r).toHaveLength(3);
  });

  it('never offers a word whose meaning overlaps the answer', () => {
    const lehrer = w(30, 'Lehrer', "o'qituvchi", { artikel: 'der' });
    const pool = [
      w(31, 'Lehrerin', "o'qituvchi ayol", { artikel: 'die' }),
      w(32, 'Arzt', 'shifokor', { artikel: 'der' }),
      w(33, 'Chef', 'rahbar', { artikel: 'der' }),
      w(34, 'Schule', 'maktab', { artikel: 'die' }),
    ];
    const r = waehleAblenker(lehrer, pool, {
      feld: (x) => x.de,
      aehnlich: true,
      bedeutung: true,
      rnd,
    })!;
    expect(r.map((x) => x.de)).not.toContain('Lehrerin');
  });

  it('a listening question may offer a word of overlapping meaning', () => {
    const lehrer = w(30, 'Lehrer', "o'qituvchi", { artikel: 'der' });
    const pool = [
      w(31, 'Lehrerin', "o'qituvchi ayol", { artikel: 'die' }),
      w(32, 'Arzt', 'shifokor', { artikel: 'der' }),
      w(33, 'Chef', 'rahbar', { artikel: 'der' }),
    ];
    const r = waehleAblenker(lehrer, pool, {
      feld: (x) => x.de,
      aehnlich: true,
      bedeutung: false,
      rnd,
    })!;
    expect(r.map((x) => x.de)).toContain('Lehrerin');
  });

  it('returns null when fewer than three can be offered', () => {
    expect(
      waehleAblenker(anderes[0], anderes.slice(0, 2), {
        feld: (x) => x.uz,
        aehnlich: false,
        bedeutung: true,
        rnd,
      }),
    ).toBeNull();
  });

  it('never repeats the answer text or one text twice', () => {
    const pool = [
      w(40, 'hallo', 'salom'),
      w(41, 'Hallo!', 'salom!'),
      w(42, 'danke', 'rahmat'),
      w(43, 'danke', 'rahmat'),
      w(44, 'ich', 'men'),
      w(45, 'du', 'sen'),
    ];
    const r = waehleAblenker(pool[0], pool, {
      feld: (x) => x.uz,
      aehnlich: false,
      bedeutung: true,
      rnd,
    })!;
    const texte = r.map((x) => x.uz);
    expect(new Set(texte).size).toBe(3);
    expect(texte).not.toContain('salom!');
  });
});
