import {
  alignWords,
  normalize,
  similarity,
  variantsOf,
  type AudioSegment,
} from './align';

const seg = (startMs: number, endMs: number, text: string): AudioSegment => ({
  startMs,
  endMs,
  text,
});

describe('normalize', () => {
  // Whisper nemischa yozuvni bir xil yozmaydi — `ß` ba'zan `ss`, umlaut
  // ba'zan yoyilgan holda keladi. Solishtirishdan oldin ikkalasi bir
  // ko'rinishga keltiriladi.
  it.each([
    ['Tschüss!', 'tschuess'],
    ['Guten Morgen!', 'guten morgen'],
    ['Mach’s gut!', 'machs gut'],
    ['Begrüßungen', 'begruessungen'],
  ])('%s → %s', (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe('variantsOf', () => {
  // «Bis dann! / Bis später!» — bitta lug'at yozuvi, lekin audio ularni
  // ikkita alohida ibora qilib o'qiydi. Ular alohida qidiriladi.
  it('bitta yozuvdagi ikki iborani ajratadi', () => {
    expect(variantsOf('Bis dann! / Bis später!')).toEqual([
      'bis dann',
      'bis spaeter',
    ]);
  });

  it('bitta iborani bitta variant deb qaytaradi', () => {
    expect(variantsOf('Hallo!')).toEqual(['hallo']);
  });
});

describe('similarity', () => {
  it('bir xil satrga 1 beradi', () => {
    expect(similarity('hallo', 'hallo')).toBe(1);
  });

  it('kichik farqni yuqori baholaydi', () => {
    expect(similarity('guten morgen', 'guten morgan')).toBeGreaterThan(0.9);
  });

  it('boshqa so`zga past baho beradi', () => {
    expect(similarity('hallo', 'tschuess')).toBeLessThan(0.4);
  });
});

describe('alignWords', () => {
  // Haqiqiy holat: birinchi bo'lak — bo'lim SARLAVHASI, so'z emas. Uni
  // birinchi so'zga bog'lash butun ro'yxatni bir pog'ona siljitardi.
  it("bo'lim sarlavhasini so'z deb hisoblamaydi", () => {
    const out = alignWords(
      ['Hallo!', 'Guten Morgen!'],
      [
        seg(0, 3380, 'begrüßungen'),
        seg(3380, 6340, 'Hallo'),
        seg(6340, 10120, 'Guten Morgen'),
      ],
    );

    expect(out[0]).toEqual({ de: 'Hallo!', startMs: 3380, endMs: 6340 });
    expect(out[1]).toEqual({
      de: 'Guten Morgen!',
      startMs: 6340,
      endMs: 10120,
    });
  });

  // Bitta yozuvdagi ikki ibora audioda ikki bo'lak — natija ikkalasini
  // qamrab oladi.
  it("ikki iborali yozuvga ikkala bo'lakni qamraydi", () => {
    const out = alignWords(
      ['Bis dann! / Bis später!'],
      [seg(43320, 46160, 'Bis dann'), seg(46160, 47280, 'Bis später')],
    );

    expect(out[0]).toEqual({
      de: 'Bis dann! / Bis später!',
      startMs: 43320,
      endMs: 47280,
    });
  });

  // Takroriy boshlanishli iboralar («Guten …») butun ro'yxat bo'ylab
  // qidirilsa chalkashardi. Qidiruv oldingi topilgan bo'lakdan KEYIN
  // davom etadi, chunki audio ro'yxatni tartib bilan o'qiydi.
  it("tartibni saqlaydi — o'xshash iboralar chalkashmaydi", () => {
    const out = alignWords(
      ['Guten Morgen!', 'Guten Tag!', 'Guten Abend!'],
      [
        seg(0, 1000, 'Guten Morgen'),
        seg(1000, 2000, 'Guten Tag'),
        seg(2000, 3000, 'Guten Abend'),
      ],
    );

    expect(out.map((w) => w.startMs)).toEqual([0, 1000, 2000]);
  });

  // ENG MUHIM QOIDA: topilmagan so'z audiosiz qoladi. Taxminiy oraliq
  // «audio bor» deb ko'rsatib, boshqa so'zni o'ynatardi — va o'quvchi
  // buni xato deb tushunmasdi, shunchaki noto'g'ri o'rganardi.
  it("topilmagan so'zni audiosiz qoldiradi", () => {
    const out = alignWords(
      ['Hallo!', 'Butunlay boshqa ibora'],
      [seg(0, 1000, 'Hallo')],
    );

    expect(out[0].startMs).toBe(0);
    expect(out[1]).toEqual({
      de: 'Butunlay boshqa ibora',
      startMs: null,
      endMs: null,
    });
  });

  // Topilmagan so'z kursorni surmaydi: u audioda umuman bo'lmasligi
  // mumkin, va keyingi so'zlar hali oldinda turadi.
  it("topilmagan so'zdan keyin qidiruv davom etadi", () => {
    const out = alignWords(
      ['Yo`q ibora', 'Guten Tag!'],
      [seg(0, 1000, 'Hallo'), seg(1000, 2000, 'Guten Tag')],
    );

    expect(out[0].startMs).toBeNull();
    expect(out[1].startMs).toBe(1000);
  });

  it("bo'lak umuman bo'lmasa hammasi audiosiz qoladi", () => {
    const out = alignWords(['Hallo!'], []);
    expect(out[0]).toEqual({ de: 'Hallo!', startMs: null, endMs: null });
  });
});
