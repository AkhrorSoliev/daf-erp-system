import {
  alignToStream,
  findInStream,
  headOf,
  pluralOf,
  tokensToWords,
  type Token,
} from './token-align';

const tok = (text: string, startMs: number, endMs: number): Token => ({
  text,
  startMs,
  endMs,
});

describe('tokensToWords', () => {
  // Whisper so'zni bo'g'inlarga bo'ladi va yangi so'zni BOSHIDAGI PROBEL
  // bilan bildiradi. Bo'g'inlarni birlashtirmasa, «Mittagessen» hech
  // qachon topilmasdi.
  it("bo'g'inlarni bitta so'zga birlashtiradi", () => {
    const words = tokensToWords([
      tok(' das', 170, 420),
      tok(' Mitt', 420, 980),
      tok('ag', 1070, 1270),
      tok('essen', 1270, 1410),
    ]);

    expect(words.map((w) => w.text)).toEqual(['das', 'mittagessen']);
    expect(words[1]).toMatchObject({ startMs: 420, endMs: 1410 });
  });

  // Whisper ikki xil xizmat tokeni chiqaradi: `[_BEG_]` va VAQT tokeni
  // `[_TT_169]`. Ikkinchisi raqamli, va faqat harfli qolipni ushlagan
  // versiya uni `tt 169` degan so'z deb oqimga qo'shib, HAR BIR moslikni
  // buzgan edi — olti fayllik sinovda 13 ta so'zdan 1 tasi topilgan.
  it('xizmat tokenlarini tashlaydi', () => {
    const words = tokensToWords([
      tok('[_BEG_]', 0, 0),
      tok(' Hallo', 100, 500),
      tok('[_TT_169]', 500, 500),
      tok(' Tag', 600, 900),
    ]);
    expect(words.map((w) => w.text)).toEqual(['hallo', 'tag']);
  });

  // Tinish belgisi so'z ochmaydi — u oldingi so'zga qo'shiladi va
  // normalizatsiyada yo'qoladi.
  it("tinish belgisi yangi so'z ochmaydi", () => {
    const words = tokensToWords([tok(' Hallo', 100, 500), tok(',', 500, 560)]);
    expect(words.map((w) => w.text)).toEqual(['hallo']);
  });
});

describe('findInStream', () => {
  const stream = tokensToWords([
    tok(' das', 0, 400),
    tok(' Mitt', 400, 900),
    tok('agessen', 900, 1400),
    tok(',', 1400, 1450),
    tok(' die', 2200, 2400),
    tok(' Beilage', 2400, 3000),
    tok(',', 3000, 3050),
    tok(' die', 3600, 3800),
    tok(' Beilagen', 3800, 4400),
  ]);

  // ENG MUHIM HOLAT: Whisper bu to'qqiz tokenni BITTA bo'lakka joylashtiradi
  // («das Mittagessen, die Beilage, die Beilagen»). Bo'lak bo'yicha
  // qidirish 17 ta faylda hech narsa topmagan edi.
  it("uzun bo'lak ichidan yozuvni topadi", () => {
    const hit = findInStream('das Mittagessen', stream, 0);
    expect(hit).toMatchObject({ startMs: 0, endMs: 1400 });
  });

  // Birlik va ko'plik ketma-ket keladi va bir-biriga juda o'xshaydi.
  // Qidiruv oldinga qarab ketgani uchun ular chalkashmaydi.
  it("birlik va ko'plikni ajratadi", () => {
    const first = findInStream('die Beilage', stream, 0)!;
    const second = findInStream('die Beilagen', stream, first.nextIndex)!;

    expect(first.startMs).toBe(2200);
    expect(second.startMs).toBe(3600);
  });

  it('topilmasa null qaytaradi', () => {
    expect(findInStream('völlig anderes Wort', stream, 0)).toBeNull();
  });
});

describe('alignToStream', () => {
  const stream = tokensToWords([
    tok(' Bis', 43450, 43900),
    tok(' dann', 43900, 44400),
    tok(',', 44400, 44450),
    tok(' bis', 46200, 46600),
    tok(' später', 46600, 47280),
  ]);

  // Bitta yozuvdagi ikki ibora audioda ikki joyda — natija ikkalasini
  // qamrab oladi.
  it("ikki iborali yozuvni to'liq qamraydi", () => {
    const out = alignToStream(['Bis dann! / Bis später!'], stream);
    expect(out[0]).toEqual({
      de: 'Bis dann! / Bis später!',
      startMs: 43450,
      endMs: 47280,
    });
  });

  // Topilmagan yozuv AUDIOSIZ qoladi: taxminiy oraliq «audio bor» deb
  // ko'rsatib, boshqa so'zni o'ynatardi.
  it('topilmagan yozuvni audiosiz qoldiradi', () => {
    const out = alignToStream(['Hallo!'], stream);
    expect(out[0]).toEqual({ de: 'Hallo!', startMs: null, endMs: null });
  });

  // Topilmagan yozuv kursorni surmaydi — u audioda umuman bo'lmasligi
  // mumkin, va keyingi yozuvlar hali oldinda turadi.
  it('topilmagan yozuvdan keyin qidiruv davom etadi', () => {
    const out = alignToStream(['Yo`q ibora', 'Bis später!'], stream);
    expect(out[0].startMs).toBeNull();
    expect(out[1].startMs).toBe(46200);
  });
});

describe('headOf', () => {
  // Lug'atda qavs ichida ko'plik yoki tahririy izoh turadi. Ularni
  // matnning bir qismi deb qidirish eng qiyin yozuvlarni topilmas
  // qilgan edi: audio «die Dönerbude» deydi, qidiruv esa
  // «die dönerbude dönerbuden» ni izlardi.
  it.each([
    ['die Dönerbude (Dönerbuden)', 'die Dönerbude'],
    ['das Gemüse (no plural)', 'das Gemüse'],
    ['das Wienerschnitzel', 'das Wienerschnitzel'],
  ])('%s → %s', (input, expected) => {
    expect(headOf(input)).toBe(expected);
  });
});

describe('pluralOf', () => {
  it("qavsdagi ko'plik shaklini beradi", () => {
    expect(pluralOf('die Dönerbude (Dönerbuden)')).toBe('Dönerbuden');
  });

  // «(no plural)» va «(plural only ?)» — izoh, so'z emas. Ularni
  // qidirish oqimdan tasodifiy joyni topib, oraliqni buzardi.
  it.each([
    'das Gemüse (no plural)',
    'die Nudeln (plural only ?)',
    'der Käse (singular)',
  ])('izohni so`z deb hisoblamaydi: %s', (input) => {
    expect(pluralOf(input)).toBeNull();
  });

  it('qavssiz yozuvda null beradi', () => {
    expect(pluralOf('das Wienerschnitzel')).toBeNull();
  });
});

describe('alignToStream — qavsli yozuv', () => {
  // Ko'plik shakli audioda ALOHIDA o'qiladi va u ham shu yozuvniki, ya'ni
  // oraliq ikkalasini qamrashi kerak.
  it("ko'plik shakligacha cho'ziladi", () => {
    const stream = tokensToWords([
      tok(' die', 10350, 10600),
      tok(' Dönerbude', 10600, 11400),
      tok(',', 11400, 11450),
      tok(' die', 12000, 12200),
      tok(' Dönerbuden', 12200, 13100),
    ]);

    const out = alignToStream(['die Dönerbude (Dönerbuden)'], stream);
    expect(out[0]).toEqual({
      de: 'die Dönerbude (Dönerbuden)',
      startMs: 10350,
      endMs: 13100,
    });
  });
});
