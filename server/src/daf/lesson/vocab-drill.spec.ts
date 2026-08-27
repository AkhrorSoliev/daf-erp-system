import {
  buildDrill,
  pickDistractors,
  shuffle,
  OPTION_COUNT,
  type DrillLexeme,
} from './vocab-drill';

/** Aniqlangan «tasodif» — test takrorlanadigan bo'lishi uchun. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const lex = (
  id: number,
  de: string,
  uz: string | null,
  audio = true,
): DrillLexeme => ({
  id,
  de,
  uz,
  audioStartMs: audio ? id * 1000 : null,
  audioEndMs: audio ? id * 1000 + 800 : null,
});

const WORDS = [
  lex(1, 'Hallo!', 'Salom!'),
  lex(2, 'Guten Morgen!', 'Xayrli tong!'),
  lex(3, 'Guten Tag!', 'Xayrli kun!'),
  lex(4, 'Tschüss!', 'Xayr!'),
  lex(5, 'Bis bald!', 'Tez orada ko`rishguncha!'),
];

describe('pickDistractors', () => {
  it("to'g'ri javobning o'zini chalg'ituvchi qilib bermaydi", () => {
    const out = pickDistractors('Hallo!', ['Hallo!', 'Tschüss!'], 3, seeded(1));
    expect(out).not.toContain('Hallo!');
  });

  it('nomzod yetmasa bor narsani beradi, takrorlamaydi', () => {
    const out = pickDistractors('a', ['a', 'b'], 3, seeded(1));
    expect(out).toEqual(['b']);
  });
});

describe('buildDrill', () => {
  it('uch xil savol beradi', () => {
    const kinds = new Set(buildDrill(WORDS, seeded(7)).map((q) => q.kind));
    expect([...kinds].sort()).toEqual([
      'AUDIO_TO_WORD',
      'UZ_TO_WORD',
      'WORD_TO_UZ',
    ]);
  });

  it("har savolda to'g'ri javob variantlar ichida bo'ladi", () => {
    for (const q of buildDrill(WORDS, seeded(3))) {
      expect(q.options).toContain(q.answer);
      expect(q.options.length).toBeLessThanOrEqual(OPTION_COUNT);
    }
  });

  // Chalg'ituvchi variantlar shu DARSNING so'zlaridan olinadi. Butun
  // lug'atdan olinsa savol bilim emas, taxminni tekshirardi: «Guten
  // Morgen» yonida «der Kühlschrank» tursa javob mavzusiga qarab
  // ko'rinib qoladi.
  it('chalg`ituvchilarni shu darsning so`zlaridan oladi', () => {
    const all = new Set(WORDS.flatMap((w) => [w.de, w.uz!]));
    for (const q of buildDrill(WORDS, seeded(11))) {
      for (const o of q.options) expect(all.has(o)).toBe(true);
    }
  });

  // Audiosiz so'zda savol audioning O'ZI bo'lgan turdan savol
  // tuzilmaydi — savolsiz mashq bo'lmaydi.
  it("audiosiz so'zga tinglash savolini bermaydi", () => {
    const words = [
      lex(1, 'Hallo!', 'Salom!', false),
      lex(2, 'Tschüss!', 'Xayr!'),
    ];
    const audioQs = buildDrill(words, seeded(5)).filter(
      (q) => q.kind === 'AUDIO_TO_WORD',
    );

    expect(audioQs.map((q) => q.lexemeId)).toEqual([2]);
  });

  // Tarjimasi yo'q so'zga tarjima savoli berilmaydi: javobi bo'lmagan
  // savol mashq emas.
  it("tarjimasiz so'zga tarjima savolini bermaydi", () => {
    const words = [
      lex(1, 'Hallo!', null),
      lex(2, 'Tschüss!', 'Xayr!'),
      lex(3, 'Bis bald!', 'Xayr!'),
    ];
    const qs = buildDrill(words, seeded(9)).filter(
      (q) => q.kind !== 'AUDIO_TO_WORD',
    );

    expect(qs.map((q) => q.lexemeId)).not.toContain(1);
  });

  // Bitta so'zli darsda tanlov yo'q — savol o'z-o'zidan javob berardi.
  it("bitta so'zli darsda savol bermaydi", () => {
    expect(buildDrill([lex(1, 'Hallo!', 'Salom!')], seeded(1))).toEqual([]);
  });

  // Javob doim bir joyda tursa, o'quvchi so'zni emas, o'rinni yodlaydi.
  it("to'g'ri javobning o'rni har xil bo'ladi", () => {
    const positions = new Set(
      buildDrill(WORDS, seeded(21)).map((q) => q.options.indexOf(q.answer)),
    );
    expect(positions.size).toBeGreaterThan(1);
  });
});

describe('shuffle', () => {
  it('elementlarni yo`qotmaydi', () => {
    const out = shuffle([1, 2, 3, 4, 5], seeded(2));
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
