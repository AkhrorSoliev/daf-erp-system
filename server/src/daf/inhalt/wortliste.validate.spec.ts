import { validateWortliste } from './wortliste.validate';
import type { WortlisteFile, WortEintrag } from './wortliste.types';
import type { KursFile } from '../kurs/kurs.types';
import type { GoetheWort } from './goethe-parse';

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
          { order: 1, code: 'u01-s1', titleDe: 'A', titleUz: 'A', grammar: 'g', grammarUz: 'g', wordBudget: 10 },
          { order: 2, code: 'u01-s2', titleDe: 'B', titleUz: 'B', grammar: 'g', grammarUz: 'g', wordBudget: 10 },
        ],
      },
    ],
  };
}

const GOETHE: GoetheWort[] = [
  { artikel: null, wort: 'hallo' },
  { artikel: null, wort: 'tschuess' },
  { artikel: 'der', wort: 'Name' },
];

function eintrag(wort: string, section = 'u01-s1'): WortEintrag {
  return { wort, artikel: null, section, core: true };
}

/** 8 ta so'z — eng kichik ruxsat etilgan bo'lim. */
function fullSection(code: string, prefix: string): WortEintrag[] {
  return Array.from({ length: 8 }, (_, i) => eintrag(`${prefix}${i}`, code));
}

function goetheFor(entries: WortEintrag[]): GoetheWort[] {
  return entries.map((e) => ({ artikel: null, wort: e.wort }));
}

describe('validateWortliste', () => {
  it('to`g`ri taqsimotda muammo topmaydi', () => {
    const eintraege = [...fullSection('u01-s1', 'a'), ...fullSection('u01-s2', 'b')];
    const file: WortlisteFile = { level: 'A1', eintraege };
    expect(validateWortliste(file, kurs(), goetheFor(eintraege))).toEqual([]);
  });

  it('bo`sh taqsimotni qabul qiladi — fayl bosqichma-bosqich to`ladi', () => {
    expect(validateWortliste({ level: 'A1', eintraege: [] }, kurs(), GOETHE)).toEqual([]);
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

  it('boshlangan bo`limda 8 dan kam so`z bo`lsa aytadi', () => {
    const eintraege = [eintrag('a0'), eintrag('a1')];
    const file: WortlisteFile = { level: 'A1', eintraege };
    const p = validateWortliste(file, kurs(), goetheFor(eintraege));
    expect(p.some((x) => x.includes('8–12'))).toBe(true);
  });

  it('bo`limda 12 dan ko`p so`z bo`lsa aytadi', () => {
    const eintraege = Array.from({ length: 13 }, (_, i) => eintrag(`a${i}`));
    const file: WortlisteFile = { level: 'A1', eintraege };
    const p = validateWortliste(file, kurs(), goetheFor(eintraege));
    expect(p.some((x) => x.includes('8–12'))).toBe(true);
  });

  it('unitning 50 so`z chegarasini aytadi', () => {
    const k = kurs();
    k.units[0].sections.push(
      { order: 3, code: 'u01-s3', titleDe: 'C', titleUz: 'C', grammar: 'g', grammarUz: 'g', wordBudget: 10 },
      { order: 4, code: 'u01-s4', titleDe: 'D', titleUz: 'D', grammar: 'g', grammarUz: 'g', wordBudget: 10 },
      { order: 5, code: 'u01-s5', titleDe: 'E', titleUz: 'E', grammar: 'g', grammarUz: 'g', wordBudget: 10 },
    );
    const eintraege = ['u01-s1', 'u01-s2', 'u01-s3', 'u01-s4', 'u01-s5'].flatMap((c, n) =>
      Array.from({ length: 11 }, (_, i) => eintrag(`w${n}_${i}`, c)),
    );
    const file: WortlisteFile = { level: 'A1', eintraege };
    const p = validateWortliste(file, k, goetheFor(eintraege));
    expect(p.some((x) => x.includes('50 so`zdan ko`p'))).toBe(true);
  });

  it('Goethe ro`yxatida yo`q so`zni sababsiz qabul qilmaydi', () => {
    const eintraege = fullSection('u01-s1', 'a');
    const file: WortlisteFile = { level: 'A1', eintraege };
    const p = validateWortliste(file, kurs(), GOETHE);
    expect(p.some((x) => x.includes("ro`yxatida yo`q"))).toBe(true);
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
