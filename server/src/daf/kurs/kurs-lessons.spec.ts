import { planLessons, lessonSourceId } from './kurs-lessons';
import type { KursUnitSpec } from './kurs.types';

function unit(sectionCount: number): KursUnitSpec {
  return {
    order: 1,
    code: 'u01',
    titleDe: 'Hallo!',
    titleUz: 'Salom!',
    theme: 'sinov',
    sections: Array.from({ length: sectionCount }, (_, i) => ({
      order: i + 1,
      code: `u01-s${i + 1}`,
      titleDe: `Abschnitt ${i + 1}`,
      titleUz: `${i + 1}-qism`,
      grammar: 'Personalpronomen',
      grammarUz: 'olmosh',
      wordBudget: 10,
    })),
  };
}

describe('planLessons', () => {
  it('5 bo`limli unitda 15 seans quradi', () => {
    // 5 bo'lim × 2 dars + 4 o'tish + 1 yakun
    expect(planLessons(unit(5))).toHaveLength(15);
  });

  it('6 bo`limli unitda 18 seans quradi', () => {
    expect(planLessons(unit(6))).toHaveLength(18);
  });

  it('tartib 1 dan uzluksiz boradi', () => {
    const orders = planLessons(unit(5)).map((l) => l.order);
    expect(orders).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it('har bo`limdan keyin A, B va o`tish keladi', () => {
    const kinds = planLessons(unit(3)).map((l) => l.kind);
    expect(kinds).toEqual([
      'SECTION_A',
      'SECTION_B',
      'BRIDGE',
      'SECTION_A',
      'SECTION_B',
      'BRIDGE',
      'SECTION_A',
      'SECTION_B',
      'UNIT_TEST',
    ]);
  });

  it('oxirgi bo`limdan keyin o`tish sinovi yo`q', () => {
    const lessons = planLessons(unit(5));
    expect(lessons.filter((l) => l.kind === 'BRIDGE')).toHaveLength(4);
  });

  it('o`tish sinovi o`zi tugatgan bo`limga bog`lanadi', () => {
    const bridge = planLessons(unit(3)).find((l) => l.kind === 'BRIDGE');
    expect(bridge?.sectionCode).toBe('u01-s1');
  });

  it('unit yakuni hech bir bo`limga bog`lanmaydi', () => {
    const test = planLessons(unit(3)).find((l) => l.kind === 'UNIT_TEST');
    expect(test?.sectionCode).toBeNull();
  });

  it('kalitlar takrorlanmaydi', () => {
    const ids = planLessons(unit(6)).map((l) => l.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('kalit o`qiladigan shaklda quriladi', () => {
    expect(lessonSourceId('u01', 'SECTION_A', 3)).toBe('u01-s03-a');
    expect(lessonSourceId('u01', 'BRIDGE', 3)).toBe('u01-s03-bridge');
    expect(lessonSourceId('u01', 'UNIT_TEST')).toBe('u01-test');
  });

  // `sectionOrder` UNIT_TEST'dan boshqa har bir tur uchun majburiy.
  // Tashlab ketilsa, avvalgi kod jimgina `u01-sundefined-a` kabi buzuq
  // kalit yasardi — endi ovoz bilan to'xtaydi.
  it.each<[Exclude<Parameters<typeof lessonSourceId>[1], 'UNIT_TEST'>]>([
    ['SECTION_A'],
    ['SECTION_B'],
    ['BRIDGE'],
  ])('%s uchun bo`lim tartibisiz chaqirilsa rad etadi', (kind) => {
    expect(() => lessonSourceId('u01', kind)).toThrow(/sectionOrder majburiy/);
  });
});
