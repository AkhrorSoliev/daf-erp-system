import { readFileSync } from 'fs';
import { join } from 'path';
import { attemptFor, parseRedrawMap, type RedrawMap } from './image-redraw';
import { seedFor } from './media-keys';

describe('parseRedrawMap', () => {
  const ok = {
    'dib-voc-03-02#10': { attempt: 1, de: 'der Honig', reason: 'suv belgisi' },
  };

  it('to`g`ri jurnalni o`qiydi', () => {
    expect(parseRedrawMap(ok)).toEqual(ok);
  });

  // Bu testlar jimgina o'tib ketishga qarshi: noto'g'ri qiymat qabul
  // qilinsa rasm qayta chizilmay qolardi, va odam "tuzatildi" deb
  // o'ylardi.
  it('attempt 0 ni rad etadi — 0 «qayta chizilmadi» degani', () => {
    expect(() =>
      parseRedrawMap({ a: { attempt: 0, de: 'x', reason: 'y' } }),
    ).toThrow(/attempt/);
  });

  it('satr ko`rinishidagi attempt ni rad etadi', () => {
    expect(() =>
      parseRedrawMap({ a: { attempt: '2', de: 'x', reason: 'y' } }),
    ).toThrow(/attempt/);
  });

  // Sababsiz yozuv jurnalning butun maqsadini yo'qqa chiqaradi.
  it('sababsiz yozuvni rad etadi', () => {
    expect(() =>
      parseRedrawMap({ a: { attempt: 1, de: 'x', reason: '  ' } }),
    ).toThrow(/reason yozilmagan/);
  });

  it('massivni rad etadi', () => {
    expect(() => parseRedrawMap([])).toThrow(/obyekt kutilgan/);
  });
});

describe('attemptFor', () => {
  const map: RedrawMap = {
    'dib-voc-03-02#10': { attempt: 1, de: 'der Honig', reason: 'suv belgisi' },
  };

  it('rad etilgan so`zga urinish raqamini beradi', () => {
    expect(attemptFor(map, 'dib-voc-03-02#10')).toBe(1);
  });

  it('rad etilmagan so`zga 0 beradi', () => {
    expect(attemptFor(map, 'dib-voc-03-02#11')).toBe(0);
  });

  // Eng muhim bog'lanish: urinish raqami HAQIQATAN ham boshqa urug'
  // beradimi. Bu tekshirilmasa, jurnal to'ldirilib ham rasm o'zgarmay
  // qolishi mumkin edi.
  it('urinish raqami urug`ni o`zgartiradi, 0 esa asl urug`ni saqlaydi', () => {
    const id = 'dib-voc-03-02#10';
    expect(seedFor(id, attemptFor(map, id))).not.toBe(seedFor(id));
    expect(seedFor(id, attemptFor(map, 'boshqa-soz'))).toBe(seedFor(id));
  });
});

describe('content/daf/image-redraw.json', () => {
  // Haqiqiy fayl haqiqatan ham o'qiladigan holatda ekanini tekshiradi —
  // aks holda xato faqat rasm chizish paytida, pul sarflangandan keyin
  // chiqardi.
  it('haqiqiy jurnal fayli to`g`ri o`qiladi', () => {
    const file = join(
      __dirname,
      '..',
      '..',
      '..',
      'content',
      'daf',
      'image-redraw.json',
    );
    expect(() =>
      parseRedrawMap(JSON.parse(readFileSync(file, 'utf8'))),
    ).not.toThrow();
  });
});
