import { istRichtig, normalisieren, tippfehler } from './antwort';

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
    expect(normalisieren('  Ich bin Anna. ')).toBe(
      normalisieren('ich bin anna'),
    );
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
    expect(istRichtig('ich bin Anna', 'Ich heiße Anna', ['Ich bin Anna'])).toBe(
      true,
    );
  });

  it("bo`sh javobni rad etadi, hatto to'g'ri javob tinish belgisi bo'lsa ham", () => {
    // Agar to'g'ri javob faqat tinish belgisi bo'lsa, masalan ".",
    // u normalisieren shundan so'ng bo'sh satr qaytaradi. O'quvchi bo'sh yozdi deb
    // javobni to'g'ri deb belgilash xato: tinish belgisini bilishi keraki.
    expect(istRichtig('', '.', [])).toBe(false);
    expect(istRichtig('   ', '!', [])).toBe(false);
  });
});

describe('tippfehler — one slip, like Duolingo', () => {
  it.each([
    ['bahnof', 'Bahnhof'],
    ['aufwidersehen', 'Auf Wiedersehen'],
    ['aufwiedersehen', 'Auf Wiedersehen'],
    ['Deustchland', 'Deutschland'],
    ['guten morgwn', 'Guten Morgen'],
    ['der bahnof', 'der Bahnhof'],
    ['geradaus', 'geradeaus'],
  ])('%s is a slip of %s', (gegeben, richtig) => {
    expect(tippfehler(gegeben, [richtig])).toBe(true);
  });

  it.each([
    ['hier', 'vier', 'a short word: one letter makes another word'],
    ['die Bahnhof', 'der Bahnhof', 'the article is grammar, not spelling'],
    ['wohne', 'wohnen', 'a verb ending is grammar'],
    ['zwanzik', 'zwanzig', 'a lowercase word ending is not forgiven'],
    ['Gutn morgn', 'Guten Morgen', 'two slips'],
    ['bahnhof hier', 'Bahnhof', 'another word count'],
    ['sehen', 'sein', 'two edits'],
    ['Bahnhof', 'Bahnhof', 'a correct answer is not a slip'],
    ['', 'Bahnhof', 'an empty answer'],
  ])('%s is not a slip of %s (%s)', (gegeben, richtig) => {
    expect(tippfehler(gegeben, [richtig])).toBe(false);
  });

  it('checks every accepted form', () => {
    expect(tippfehler('der bahnof', ['Bahnhof', 'der Bahnhof'])).toBe(true);
  });
});
