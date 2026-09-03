import { imageKeyFor, seedFor } from './media-keys';

describe('imageKeyFor', () => {
  it('R2 kalitini barqaror yasaydi', () => {
    expect(imageKeyFor('voc_01_01_begr_3')).toBe(
      'daf/img/voc_01_01_begr_3.jpg',
    );
  });

  // `#` manzilda bo'lak ajratgich — brauzer undan keyingisini
  // serverga yubormaydi, va R2 404 qaytaradi (rasm bor bo'lsa ham).
  // Haqiqiy sourceId bilan: prod kutubxonasida uchraydi.
  it('`#` belgisini kalitdan olib tashlaydi', () => {
    const key = imageKeyFor('dib-voc-03-01#2');
    expect(key).not.toContain('#');
    expect(key).toBe('daf/img/dib-voc-03-01_2.jpg');
  });

  // Boshqa manzilda xavfli belgilar ham (bo'shliq, `?`, `%`) xuddi
  // shunday tozalanishi kerak — faqat `#`ga maxsus istisno emas.
  it('boshqa manzilda xavfli belgilarni ham tozalaydi', () => {
    const key = imageKeyFor('weird id?a=1 100%');
    expect(key).toBe('daf/img/weird_id_a_1_100_.jpg');
  });
});

describe('seedFor', () => {
  it('bir xil sourceId uchun har doim bir xil urug` qaytaradi', () => {
    const a = seedFor('dib-voc-03-01#2');
    const b = seedFor('dib-voc-03-01#2');
    expect(a).toBe(b);
  });

  it('boshqa sourceId uchun boshqa urug` qaytaradi', () => {
    expect(seedFor('dib-voc-03-01#2')).not.toBe(seedFor('dib-voc-03-01#3'));
  });

  it('manfiy bo`lmagan butun son qaytaradi', () => {
    const seed = seedFor('dib-voc-03-01#2');
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
  });
});
