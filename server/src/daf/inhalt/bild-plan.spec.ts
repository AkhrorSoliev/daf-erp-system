import { validateBildPlan } from './bild-plan';

const woerter = [
  {
    sourceId: 'u03-s4-fahrrad',
    section: 'u03-s4',
    de: 'Fahrrad',
    artikel: 'das',
    uz: 'velosiped',
    core: true,
    order: 1,
  },
  {
    sourceId: 'u03-s5-oft',
    section: 'u03-s5',
    de: 'oft',
    uz: "ko'pincha",
    core: true,
    order: 2,
  },
];

const KEY = 'daf/bild/0123456789abcdef0123456789abcdef.jpg';

describe('validateBildPlan', () => {
  it('accepts a planned noun with its generated key', () => {
    const plan = { 'u03-s4-fahrrad': { szene: 'a bicycle', tippen: true } };
    expect(validateBildPlan(plan, woerter, { 'u03-s4-fahrrad': KEY })).toEqual(
      [],
    );
  });

  it('accepts a planned word that has no picture yet', () => {
    const plan = { 'u03-s4-fahrrad': { szene: 'a bicycle', tippen: true } };
    expect(validateBildPlan(plan, woerter, {})).toEqual([]);
  });

  it('rejects a plan entry for an unknown word', () => {
    expect(
      validateBildPlan(
        { 'u03-s4-xyz': { szene: 'x', tippen: false } },
        woerter,
        {},
      ),
    ).toEqual(["u03-s4-xyz: rasm rejasida bor, lekin so'zlar faylida yo'q"]);
  });

  it('rejects tippen on a word without an article', () => {
    expect(
      validateBildPlan(
        { 'u03-s5-oft': { szene: 'x', tippen: true } },
        woerter,
        {},
      ),
    ).toEqual([
      "u03-s5-oft: rasmga qarab yozish faqat artiklli otga (tippen: true artiklsiz so'zda)",
    ]);
  });

  it('rejects an empty scene', () => {
    expect(
      validateBildPlan(
        { 'u03-s4-fahrrad': { szene: ' ', tippen: false } },
        woerter,
        {},
      ),
    ).toEqual(["u03-s4-fahrrad: sahna (szene) bo'sh"]);
  });

  it('rejects a manifest key for a word that is not planned', () => {
    expect(validateBildPlan({}, woerter, { 'u03-s4-fahrrad': KEY })).toEqual([
      "u03-s4-fahrrad: rasm manifestda bor, lekin rasm rejasida yo'q",
    ]);
  });

  it('rejects a key that is not a random picture key', () => {
    const plan = { 'u03-s4-fahrrad': { szene: 'a bicycle', tippen: true } };
    expect(
      validateBildPlan(plan, woerter, {
        'u03-s4-fahrrad': 'daf/img/u03-s4-fahrrad.jpg',
      }),
    ).toEqual([
      "u03-s4-fahrrad: rasm kaliti tasodifiy emas (daf/bild/<hex>.jpg bo'lishi kerak)",
    ]);
  });

  it('leaves other units` manifest entries alone', () => {
    expect(validateBildPlan({}, woerter, { 'u01-s1-hallo': KEY })).toEqual([]);
  });

  it('rejects the same picture key on two words', () => {
    const zwei = [
      ...woerter,
      { ...woerter[0], sourceId: 'u03-s4-rad', de: 'Rad' },
    ];
    const plan = {
      'u03-s4-fahrrad': { szene: 'a bicycle', tippen: true },
      'u03-s4-rad': { szene: 'a wheel', tippen: false },
    };
    expect(
      validateBildPlan(plan, zwei, {
        'u03-s4-fahrrad': KEY,
        'u03-s4-rad': KEY,
      }),
    ).toEqual([
      "u03-s4-rad: rasm kaliti boshqa so'zda ham bor (u03-s4-fahrrad) — rasm variantlari bir xil bo'lib qoladi",
    ]);
  });
});
