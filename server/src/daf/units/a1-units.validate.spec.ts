import { validateA1Units } from './a1-units.validate';
import type { A1UnitsFile } from './a1-units.types';

const sizes = new Map([
  ['s1', 20],
  ['s2', 20],
  ['s3', 18],
  ['s4', 22],
]);
const all = ['s1', 's2', 's3', 's4'];

function file(units: A1UnitsFile['units']): A1UnitsFile {
  return { level: 'A1', units };
}

const good = file([
  {
    order: 1,
    titleUz: 'Bir',
    titleDe: 'Eins',
    sections: ['s1', 's2'],
    grammar: [],
  },
  {
    order: 2,
    titleUz: 'Ikki',
    titleDe: 'Zwei',
    sections: ['s3', 's4'],
    grammar: [],
  },
]);

describe('validateA1Units', () => {
  it('to`g`ri faylga e`tiroz bildirmaydi', () => {
    expect(validateA1Units(good, sizes, all)).toEqual([]);
  });

  // Tegmagan mavzu — jimgina yo'qolgan kontent. Faza 1b da aynan shu
  // turdagi jimlik 256 mashqni yo'qotgan edi.
  it('bo`limga tegmagan mavzuni topadi', () => {
    const f = file([good.units[0]]);
    expect(validateA1Units(f, sizes, all)).toContain(
      "Hech bir bo'limga tegmagan mavzu: s3, s4",
    );
  });

  it('ikki bo`limda takrorlangan mavzuni topadi', () => {
    const f = file([
      { ...good.units[0], sections: ['s1', 's2'] },
      { ...good.units[1], sections: ['s2', 's3', 's4'] },
    ]);
    expect(validateA1Units(f, sizes, all)).toContain(
      "Bir necha bo'limda takrorlangan mavzu: s2",
    );
  });

  it('noma`lum mavzu identifikatorini topadi', () => {
    const f = file([
      { ...good.units[0], sections: ['s1', 's2'] },
      { ...good.units[1], sections: ['s3', 's4', 'yoq'] },
    ]);
    expect(validateA1Units(f, sizes, all)).toContain(
      "Manbada yo'q mavzu: yoq (2-bo'lim)",
    );
  });

  // Juda kichik bo'lim darsni bo'shatadi, juda katta bo'lim o'quvchini
  // cho'ktiradi. Ikkalasi ham 12 savollik darsni buzadi.
  it('juda kichik bo`limni topadi', () => {
    const small = new Map(sizes).set('s3', 2).set('s4', 3);
    expect(validateA1Units(good, small, all)).toContain(
      "2-bo'lim: 5 so'z — 30 dan kam",
    );
  });

  it('juda katta bo`limni topadi', () => {
    const big = new Map(sizes).set('s3', 40).set('s4', 40);
    expect(validateA1Units(good, big, all)).toContain(
      "2-bo'lim: 80 so'z — 50 dan ko'p",
    );
  });

  it('tartib raqamlari uzluksiz 1 dan boshlanishini talab qiladi', () => {
    const f = file([good.units[0], { ...good.units[1], order: 5 }]);
    expect(validateA1Units(f, sizes, all)).toContain(
      'Tartib raqamlari uzluksiz emas: 1, 5',
    );
  });
});
