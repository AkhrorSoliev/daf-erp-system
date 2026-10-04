import {
  goetheOhnePlan,
  UNIT_WORDS_MAX,
  validateWortliste,
  vergleicheMitPlan,
  WORDS_MAX,
  WORDS_MIN,
} from './wortliste.validate';
import type { WortlisteFile, WortEintrag } from './wortliste.types';
import type { HilfswoerterFile } from './unit-inhalt.types';
import type { KursFile } from '../kurs/kurs.types';
import type { GoetheFile } from './goethe-parse';

function kurs(): KursFile {
  return {
    level: 'A1',
    units: [
      {
        order: 1,
        code: 'u01',
        titleDe: 'Hallo!',
        titleUz: 'Salom!',
        theme: 'tanishuv',
        sections: [
          {
            order: 1,
            code: 'u01-s1',
            titleDe: 'A',
            titleUz: 'A',
            grammar: 'g',
            grammarUz: 'g',
            wordBudget: 10,
          },
          {
            order: 2,
            code: 'u01-s2',
            titleDe: 'B',
            titleUz: 'B',
            grammar: 'g',
            grammarUz: 'g',
            wordBudget: 10,
          },
        ],
      },
    ],
  };
}

const GOETHE: GoetheFile = {
  source: 'test',
  woerter: [
    { wort: 'hallo', artikel: null },
    { wort: 'tschuess', artikel: null },
    { wort: 'Name', artikel: 'der' },
  ],
};

function eintrag(wort: string, section = 'u01-s1'): WortEintrag {
  return { wort, artikel: null, section, core: true };
}

/** 8 ta so'z — eng kichik ruxsat etilgan bo'lim. */
function fullSection(code: string, prefix: string): WortEintrag[] {
  return Array.from({ length: 8 }, (_, i) => eintrag(`${prefix}${i}`, code));
}

function goetheFor(entries: WortEintrag[]): GoetheFile {
  return {
    source: 'test',
    woerter: entries.map((e) => ({ wort: e.wort, artikel: null })),
  };
}

describe('validateWortliste', () => {
  it('to`g`ri taqsimotda muammo topmaydi', () => {
    const eintraege = [
      ...fullSection('u01-s1', 'a'),
      ...fullSection('u01-s2', 'b'),
    ];
    const file: WortlisteFile = { level: 'A1', eintraege };
    expect(validateWortliste(file, kurs(), goetheFor(eintraege))).toEqual([]);
  });

  it('bo`sh taqsimotni qabul qiladi — fayl bosqichma-bosqich to`ladi', () => {
    expect(
      validateWortliste({ level: 'A1', eintraege: [] }, kurs(), GOETHE),
    ).toEqual([]);
  });

  it('bir so`z ikki bo`limda turolmasligini aytadi', () => {
    const eintraege = [
      ...fullSection('u01-s1', 'a'),
      ...fullSection('u01-s2', 'b'),
      eintrag('a0', 'u01-s2'),
    ];
    const file: WortlisteFile = { level: 'A1', eintraege };
    const p = validateWortliste(file, kurs(), goetheFor(eintraege));
    expect(p.some((x) => x.includes('ikki joyda'))).toBe(true);
  });

  it('mavjud bo`lmagan bo`lim kalitini aytadi', () => {
    const eintraege = [...fullSection('u01-s1', 'a'), eintrag('x1', 'u09-s3')];
    const file: WortlisteFile = { level: 'A1', eintraege };
    const p = validateWortliste(file, kurs(), goetheFor(eintraege));
    expect(p.some((x) => x.includes('xaritada yo`q'))).toBe(true);
  });

  const oraliq = `${WORDS_MIN}–${WORDS_MAX}`;

  it('boshlangan bo`limda 8 dan kam so`z bo`lsa aytadi', () => {
    const eintraege = [eintrag('a0'), eintrag('a1')];
    const file: WortlisteFile = { level: 'A1', eintraege };
    const p = validateWortliste(file, kurs(), goetheFor(eintraege));
    expect(p.some((x) => x.includes(oraliq))).toBe(true);
  });

  it('bo`limda chegaradan ko`p so`z bo`lsa aytadi', () => {
    const eintraege = Array.from({ length: WORDS_MAX + 1 }, (_, i) =>
      eintrag(`a${i}`),
    );
    const file: WortlisteFile = { level: 'A1', eintraege };
    const p = validateWortliste(file, kurs(), goetheFor(eintraege));
    expect(p.some((x) => x.includes(oraliq))).toBe(true);
  });

  it('a section pool of up to forty words is fine (ADR-0071)', () => {
    const eintraege = Array.from({ length: WORDS_MAX }, (_, i) =>
      eintrag(`a${i}`),
    );
    const file: WortlisteFile = { level: 'A1', eintraege };
    expect(validateWortliste(file, kurs(), goetheFor(eintraege))).toEqual([]);
  });

  it('a word built from taught words stays outside the budget', () => {
    const abgeleitet = Array.from({ length: 8 }, (_, i) => ({
      ...eintrag(`z${i}`),
      ausserhalbBudget: true,
      grund: 'son: birlik + zehn',
    }));
    const eintraege = [...fullSection('u01-s1', 'a'), ...abgeleitet];
    const file: WortlisteFile = { level: 'A1', eintraege };
    expect(validateWortliste(file, kurs(), goetheFor(eintraege))).toEqual([]);
  });

  it('outside the budget needs a reason', () => {
    const eintraege = [
      ...fullSection('u01-s1', 'a'),
      { ...eintrag('z0'), ausserhalbBudget: true },
    ];
    const file: WortlisteFile = { level: 'A1', eintraege };
    const p = validateWortliste(file, kurs(), goetheFor(eintraege));
    expect(p.some((x) => x.includes('z0') && x.includes('sabab'))).toBe(true);
  });

  it('unitning so`z chegarasini aytadi', () => {
    const k = kurs();
    k.units[0].sections.push(
      {
        order: 3,
        code: 'u01-s3',
        titleDe: 'C',
        titleUz: 'C',
        grammar: 'g',
        grammarUz: 'g',
        wordBudget: 10,
      },
      {
        order: 4,
        code: 'u01-s4',
        titleDe: 'D',
        titleUz: 'D',
        grammar: 'g',
        grammarUz: 'g',
        wordBudget: 10,
      },
      {
        order: 5,
        code: 'u01-s5',
        titleDe: 'E',
        titleUz: 'E',
        grammar: 'g',
        grammarUz: 'g',
        wordBudget: 10,
      },
    );
    const eintraege = [
      'u01-s1',
      'u01-s2',
      'u01-s3',
      'u01-s4',
      'u01-s5',
    ].flatMap((c, n) =>
      Array.from({ length: WORDS_MAX - 1 }, (_, i) => eintrag(`w${n}_${i}`, c)),
    );
    const file: WortlisteFile = { level: 'A1', eintraege };
    const p = validateWortliste(file, k, goetheFor(eintraege));
    expect(p.some((x) => x.includes(`${UNIT_WORDS_MAX} so\`zdan ko\`p`))).toBe(
      true,
    );
  });

  it('a decided exception needs a reason and cannot also be planned', () => {
    const eintraege = fullSection('u01-s1', 'a');
    const file: WortlisteFile = {
      level: 'A1',
      eintraege,
      ausgenommen: [
        { wort: 'Bier', artikel: 'das', grund: ' ' },
        { wort: 'a0', artikel: null, grund: 'test' },
      ],
    };
    const p = validateWortliste(file, kurs(), goetheFor(eintraege));
    expect(p.some((x) => x.startsWith('Bier') && x.includes('sabab'))).toBe(
      true,
    );
    expect(p.some((x) => x.startsWith('a0') && x.includes('ham rejada'))).toBe(
      true,
    );
  });

  it('a word cannot be both drilled and a helper word', () => {
    const eintraege = fullSection('u01-s1', 'a');
    const file: WortlisteFile = { level: 'A1', eintraege };
    const hilfs: HilfswoerterFile = {
      eintraege: [{ wort: 'A3', grund: 'test' }],
    };
    const p = validateWortliste(file, kurs(), goetheFor(eintraege), hilfs);
    expect(p).toEqual([`A3: ham u01-s1 so\`zi, ham yordamchi so\`z`]);
  });

  it('Goethe ro`yxatida yo`q so`zni sababsiz qabul qilmaydi', () => {
    const eintraege = fullSection('u01-s1', 'a');
    const file: WortlisteFile = { level: 'A1', eintraege };
    const p = validateWortliste(file, kurs(), GOETHE);
    expect(p.some((x) => x.includes('ro`yxatida yo`q'))).toBe(true);
  });

  it('sabab yozilgan so`zni qabul qiladi', () => {
    const eintraege = fullSection('u01-s1', 'a').map((e) => ({
      ...e,
      grund: 'kundalik nutqda kerak, imtihon ro`yxatidan tashqarida',
    }));
    const file: WortlisteFile = { level: 'A1', eintraege };
    expect(validateWortliste(file, kurs(), GOETHE)).toEqual([]);
  });

  it('bitta so`z bo`lim xatosi va Goethe yo`qligi ikkala muammoni birga aytadi', () => {
    const eintraege = [eintrag('unknown_word', 'u99-s9')];
    const file: WortlisteFile = { level: 'A1', eintraege };
    const problems = validateWortliste(file, kurs(), GOETHE);
    expect(problems.length).toBeGreaterThanOrEqual(2);
    expect(problems.some((x) => x.includes('xaritada yo`q'))).toBe(true);
    expect(problems.some((x) => x.includes('ro`yxatida yo`q'))).toBe(true);
  });
});

describe('goetheOhnePlan — Goethe words the plan leaves out (ADR-0071)', () => {
  const goethe: GoetheFile = {
    source: 'test',
    woerter: [
      { wort: 'Tag', artikel: 'der' },
      { wort: 'gern', artikel: null, varianten: ['gerne'] },
      { wort: 'essen', artikel: null, auch: ['Essen'] },
      { wort: 'Wiederhören', artikel: 'das' },
      { wort: 'aber', artikel: null },
      { wort: 'Bier', artikel: 'das' },
      { wort: 'dies-', artikel: null },
      { wort: 'Lieblings-', artikel: null },
      { wort: 'Hund', artikel: 'der' },
    ],
  };
  const hilfs: HilfswoerterFile = { eintraege: [{ wort: 'aber', grund: 't' }] };
  const plan = (woerter: string[], deckt?: string[]): WortlisteFile => ({
    level: 'A1',
    eintraege: woerter.map((w, i) => ({
      ...eintrag(w),
      ...(i === 0 && deckt ? { deckt } : {}),
    })),
    ausgenommen: [{ wort: 'Bier', artikel: 'das', grund: 'CEO qarori' }],
  });

  it('counts plan words, variants, homographs, helper words and exceptions', () => {
    const p = plan(
      [
        'auf Wiederhören',
        'Tag',
        'gerne',
        'Essen',
        'diesen',
        'Lieblingsfilm',
        'Hund',
      ],
      ['Wiederhören'],
    );
    expect(goetheOhnePlan(goethe, p, hilfs)).toEqual([]);
  });

  it('lists what is missing', () => {
    expect(
      goetheOhnePlan(goethe, plan(['Tag', 'gern', 'essen']), hilfs),
    ).toEqual(['Wiederhören', 'dies-', 'Lieblings-', 'Hund']);
  });

  it('a phrase covers a headword only when it says so', () => {
    const p = plan(['auf Wiederhören']);
    expect(goetheOhnePlan(goethe, p, hilfs)).toContain('Wiederhören');
  });

  it('a lowercase stem needs an inflected form, not any word that starts with it', () => {
    const p = plan(['Diesel']);
    expect(goetheOhnePlan(goethe, p, hilfs)).toContain('dies-');
  });
});

describe('vergleicheMitPlan — a written unit against its plan (ADR-0071)', () => {
  const file: WortlisteFile = {
    level: 'A1',
    eintraege: [
      eintrag('hallo', 'u01-s1'),
      eintrag('Name', 'u01-s1'),
      { ...eintrag('ciao', 'u01-s1'), nachtrag: true },
      eintrag('fremd', 'u02-s1'),
    ],
  };
  const wort = (de: string, section = 'u01-s1', core = true) => ({
    de,
    section,
    core,
  });

  it('finds nothing when the core words are the plan', () => {
    expect(
      vergleicheMitPlan([wort('hallo'), wort('Name')], file, ['u01-s1']),
    ).toEqual({ fehlt: [], ueberzaehlig: [] });
  });

  it('a backfill word is not due yet, but may already be written', () => {
    expect(
      vergleicheMitPlan([wort('hallo'), wort('Name'), wort('ciao')], file, [
        'u01-s1',
      ]),
    ).toEqual({ fehlt: [], ueberzaehlig: [] });
  });

  it('reports a planned word that is missing and a core word that is not planned', () => {
    expect(
      vergleicheMitPlan(
        [wort('hallo'), wort('tschüss'), wort('Name', 'u01-s1', false)],
        file,
        ['u01-s1'],
      ),
    ).toEqual({ fehlt: ['u01-s1|name'], ueberzaehlig: ['u01-s1|tschüss'] });
  });

  it('a word in the wrong section counts both ways', () => {
    expect(
      vergleicheMitPlan([wort('hallo'), wort('Name', 'u01-s2')], file, [
        'u01-s1',
        'u01-s2',
      ]),
    ).toEqual({ fehlt: ['u01-s1|name'], ueberzaehlig: ['u01-s2|name'] });
  });
});
