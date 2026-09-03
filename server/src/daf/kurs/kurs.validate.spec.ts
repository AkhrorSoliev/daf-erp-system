import { validateKurs } from './kurs.validate';
import type { KursFile, KursUnitSpec } from './kurs.types';

/** 6 bo'limli unitda byudjet 8, 5 bo'limlida 10 — ikkalasi ham 50 ga sig'adi. */
function unit(order: number, sectionCount = 5): KursUnitSpec {
  const code = `u${String(order).padStart(2, '0')}`;
  const budget = sectionCount === 6 ? 8 : 10;
  return {
    order,
    code,
    titleDe: `Kapitel ${order}`,
    titleUz: `${order}-unit`,
    theme: 'sinov mavzusi',
    sections: Array.from({ length: sectionCount }, (_, i) => ({
      order: i + 1,
      code: `${code}-s${i + 1}`,
      titleDe: `Abschnitt ${i + 1}`,
      titleUz: `${i + 1}-qism`,
      grammar: 'Personalpronomen',
      grammarUz: 'Kishilik olmoshi',
      wordBudget: budget,
    })),
  };
}

/** 8 ta unit 5 bo'limli, 4 tasi 6 bo'limli → 40 + 24 = 64. */
function fullKurs(): KursFile {
  const six = new Set([4, 7, 9, 12]);
  return {
    level: 'A1',
    units: Array.from({ length: 12 }, (_, i) =>
      unit(i + 1, six.has(i + 1) ? 6 : 5),
    ),
  };
}

function has(problems: string[], needle: string): boolean {
  return problems.some((p) => p.includes(needle));
}

describe('validateKurs', () => {
  it('to`g`ri xaritada muammo topmaydi', () => {
    expect(validateKurs(fullKurs())).toEqual([]);
  });

  it('unit soni 12 emasligini aytadi', () => {
    const f = fullKurs();
    f.units.pop();
    expect(has(validateKurs(f), '12 ta unit')).toBe(true);
  });

  it('bo`lim soni 5 dan kam bo`lsa aytadi', () => {
    const f = fullKurs();
    f.units[0].sections.pop();
    expect(has(validateKurs(f), '5–6 bo`lim')).toBe(true);
  });

  it('bo`limning so`z byudjeti chegaradan chiqsa aytadi', () => {
    const f = fullKurs();
    f.units[0].sections[0].wordBudget = 13;
    expect(has(validateKurs(f), '8–12 so`z')).toBe(true);
  });

  it('unitning jami byudjeti 50 dan oshsa aytadi', () => {
    const f = fullKurs();
    f.units[0].sections.forEach((s) => (s.wordBudget = 12));
    expect(has(validateKurs(f), '50 so`zdan ko`p')).toBe(true);
  });

  it('takrorlangan bo`lim kalitini aytadi', () => {
    const f = fullKurs();
    f.units[1].sections[0].code = f.units[0].sections[0].code;
    expect(has(validateKurs(f), 'takrorlangan')).toBe(true);
  });

  it('unit tartibi uzluksiz emasligini aytadi', () => {
    const f = fullKurs();
    f.units[3].order = 9;
    expect(has(validateKurs(f), 'uzluksiz emas')).toBe(true);
  });

  it('bo`sh sarlavhani aytadi', () => {
    const f = fullKurs();
    f.units[2].sections[1].titleUz = '   ';
    expect(has(validateKurs(f), 'sarlavhasi bo`sh')).toBe(true);
  });

  it('grammatika yozilmaganini aytadi', () => {
    const f = fullKurs();
    f.units[2].sections[1].grammar = '';
    expect(has(validateKurs(f), 'grammatikasi bo`sh')).toBe(true);
  });

  it('bo`lim kaliti unit kalitiga mos emasligini aytadi', () => {
    const f = fullKurs();
    f.units[0].sections[0].code = 'u07-s1';
    expect(has(validateKurs(f), 'kaliti unitga mos emas')).toBe(true);
  });

  it('jami bo`lim soni 64 emasligini aytadi', () => {
    const f = fullKurs();
    f.units[0].sections.pop();
    expect(has(validateKurs(f), '64 ta bo`lim')).toBe(true);
  });
});
