import { istRichtig, normalisieren } from './antwort';

describe('normalisieren', () => {
  it('katta-kichik harfni tenglashtiradi', () => {
    expect(normalisieren('Hallo')).toBe(normalisieren('hallo'));
  });

  it('ß va ss ni tenglashtiradi', () => {
    expect(normalisieren('heißen')).toBe(normalisieren('heissen'));
  });

  it('umlautning yozma shaklini tenglashtiradi', () => {
    expect(normalisieren('tschüss')).toBe(normalisieren('tschuess'));
    expect(normalisieren('Käse')).toBe(normalisieren('Kaese'));
  });

  it('tinish belgisi va ortiqcha bo`shliqni tashlaydi', () => {
    expect(normalisieren('  Ich bin Anna. ')).toBe(normalisieren('ich bin anna'));
  });

  it('so`z orasidagi ikki bo`shliqni bittaga keltiradi', () => {
    expect(normalisieren('Ich  bin')).toBe(normalisieren('Ich bin'));
  });
});

describe('istRichtig', () => {
  it('aynan mos javobni qabul qiladi', () => {
    expect(istRichtig('hallo', 'hallo')).toBe(true);
  });

  it('imlo farqini kechiradi', () => {
    expect(istRichtig('Tschuess!', 'tschüss')).toBe(true);
  });

  it('boshqa so`zni rad etadi', () => {
    expect(istRichtig('danke', 'hallo')).toBe(false);
  });

  it('qabul qilinadigan variantlardan birini ham to`g`ri deb biladi', () => {
    // Bir necha to'g'ri javob bo'lishi mumkin: «Men O'zbekistondanman»
    // va «O'zbekistondanman» ikkalasi ham to'g'ri.
    expect(istRichtig('ich bin Anna', 'Ich heiße Anna', ['Ich bin Anna'])).toBe(true);
  });

  it('bo`sh javobni rad etadi', () => {
    expect(istRichtig('', 'hallo')).toBe(false);
    expect(istRichtig('   ', 'hallo')).toBe(false);
  });
});
