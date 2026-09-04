import { baueSeans, FORMAT_MAX_PRO_SEANS } from './seans';
import type { Frage, FrageFormat } from './frage.types';

function f(format: FrageFormat, itemId: number): Frage {
  return {
    format,
    itemType: 'WORT',
    itemId,
    prompt: `p${itemId}`,
    hilfe: null,
    options: [],
    richtig: 'x',
    akzeptiert: [],
  };
}

/** Har formatdan yetarlicha nomzod. */
function kandidaten(): Frage[] {
  const formate: FrageFormat[] = [
    'WORT_UZ', 'UZ_WORT', 'PAAR', 'ARTIKEL',
    'LUECKE', 'SATZ_BAUEN', 'SATZ_UEBERSETZEN', 'REAKTION',
  ];
  return formate.flatMap((fmt, i) =>
    Array.from({ length: 5 }, (_, j) => f(fmt, i * 10 + j)),
  );
}

const rnd = (): number => 0.5;

describe('baueSeans', () => {
  it('so`ralgan sondagi savolni beradi', () => {
    expect(baueSeans(kandidaten(), 12, rnd).fragen).toHaveLength(12);
  });

  it('bitta formatni uch martadan ko`p ishlatmaydi', () => {
    const { fragen } = baueSeans(kandidaten(), 12, rnd);
    const sanoq = new Map<string, number>();
    for (const q of fragen) sanoq.set(q.format, (sanoq.get(q.format) ?? 0) + 1);
    for (const n of sanoq.values()) expect(n).toBeLessThanOrEqual(FORMAT_MAX_PRO_SEANS);
  });

  it('ketma-ket ikki savolni bir formatda qo`ymaydi', () => {
    const { fragen } = baueSeans(kandidaten(), 12, rnd);
    for (let i = 1; i < fragen.length; i += 1) {
      expect(fragen[i].format).not.toBe(fragen[i - 1].format);
    }
  });

  it('kamida besh xil format ishlatadi', () => {
    const { verwendeteFormate } = baueSeans(kandidaten(), 12, rnd);
    expect(verwendeteFormate.length).toBeGreaterThanOrEqual(5);
  });

  it('bir materialni bir seansda ikki marta so`ramaydi', () => {
    const { fragen } = baueSeans(kandidaten(), 12, rnd);
    const kalitlar = fragen.map((q) => `${q.itemType}:${q.itemId}`);
    expect(new Set(kalitlar).size).toBe(kalitlar.length);
  });

  it('nomzod yetmasa borini beradi, takrorlamaydi', () => {
    const kam = [f('WORT_UZ', 1), f('UZ_WORT', 2), f('PAAR', 3)];
    const { fragen } = baueSeans(kam, 12, rnd);
    expect(fragen).toHaveLength(3);
    expect(new Set(fragen.map((q) => q.itemId)).size).toBe(3);
  });

  it('bitta formatdan iborat nomzodda uchtadan ko`p bermaydi', () => {
    const bir = Array.from({ length: 10 }, (_, i) => f('WORT_UZ', i));
    expect(baueSeans(bir, 12, rnd).fragen).toHaveLength(1);
  });

  it('qaytarish savollarini seansga albatta qo`shadi', () => {
    // Muddati kelgan so'zlar oddiy nomzodlardan OLDIN joylashadi:
    // ular seansning sababi, qolgani to'ldiruvchi.
    const wiederholung = [f('UZ_WORT', 900), f('WORT_UZ', 901)];
    const { fragen } = baueSeans(kandidaten(), 12, rnd, wiederholung);
    const ids = fragen.map((q) => q.itemId);
    expect(ids).toContain(900);
    expect(ids).toContain(901);
  });

  it('qaytarish savollari ham qoidalarga bo`ysunadi', () => {
    const wiederholung = [f('WORT_UZ', 900), f('WORT_UZ', 901)];
    const { fragen } = baueSeans(kandidaten(), 12, rnd, wiederholung);
    for (let i = 1; i < fragen.length; i += 1) {
      expect(fragen[i].format).not.toBe(fragen[i - 1].format);
    }
  });
});
