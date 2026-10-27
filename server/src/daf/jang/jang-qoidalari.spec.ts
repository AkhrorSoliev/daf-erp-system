import {
  jangNatijasi,
  jangYoqilganmi,
  kuch,
  otilganUnitlar,
  raqibIsmi,
  seriya,
  yangiToplamNavbati,
} from './jang-qoidalari';

describe('jangNatijasi', () => {
  it("ko'p to'g'ri javob yutadi, vaqtdan qat'i nazar", () => {
    expect(
      jangNatijasi({ togri: 4, ms: 50_000 }, { togri: 3, ms: 10_000 }),
    ).toBe('WIN');
    expect(
      jangNatijasi({ togri: 2, ms: 1_000 }, { togri: 3, ms: 50_000 }),
    ).toBe('LOSS');
  });
  it("teng bo'lsa tezroq yutadi", () => {
    expect(
      jangNatijasi({ togri: 3, ms: 20_000 }, { togri: 3, ms: 21_000 }),
    ).toBe('WIN');
    expect(
      jangNatijasi({ togri: 3, ms: 22_000 }, { togri: 3, ms: 21_000 }),
    ).toBe('LOSS');
  });
  it('hammasi teng — durang', () => {
    expect(
      jangNatijasi({ togri: 3, ms: 20_000 }, { togri: 3, ms: 20_000 }),
    ).toBe('DRAW');
  });
});

describe('yangiToplamNavbati', () => {
  it("har 3-jang yangi to'plam", () => {
    expect([0, 1, 2, 3, 4, 5].map(yangiToplamNavbati)).toEqual([
      false,
      false,
      true,
      false,
      false,
      true,
    ]);
  });
});

describe('kuch', () => {
  it('3 tadan kam jang — 0.6', () => {
    expect(kuch([])).toBe(0.6);
    expect(kuch([6, 6])).toBe(0.6);
  });
  it('oxirgi 10 jang ulushi', () => {
    expect(kuch([3, 3, 3])).toBe(0.5);
    // 11-jang hisobga kirmaydi.
    expect(kuch([6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 0])).toBe(1);
  });
});

describe('seriya', () => {
  it("boshidagi ketma-ket g'alabalar", () => {
    expect(seriya(['WIN', 'WIN', 'LOSS', 'WIN'])).toBe(2);
    expect(seriya(['DRAW', 'WIN'])).toBe(0);
    expect(seriya([])).toBe(0);
  });
});

describe('raqibIsmi', () => {
  it('ism + familiya bosh harfi', () => {
    expect(raqibIsmi({ firstName: 'Sevinch', lastName: 'tanieva' })).toBe(
      'Sevinch T.',
    );
  });
  it("familiya bo'sh — faqat ism", () => {
    expect(raqibIsmi({ firstName: 'Sevinch', lastName: '  ' })).toBe('Sevinch');
  });
});

describe('jangYoqilganmi', () => {
  it('on — hammaga', () => expect(jangYoqilganmi('on', 7)).toBe(true));
  it("bo'sh/off/noma'lum — o'chiq", () => {
    expect(jangYoqilganmi(undefined, 7)).toBe(false);
    expect(jangYoqilganmi('off', 7)).toBe(false);
    expect(jangYoqilganmi('yes', 7)).toBe(false);
  });
  it("ro'yxat — faqat ulardagi o'quvchiga", () => {
    expect(jangYoqilganmi('7, 12', 12)).toBe(true);
    expect(jangYoqilganmi('7,12', 8)).toBe(false);
  });
});

describe('otilganUnitlar', () => {
  it('barcha darsi tugagan unit', () => {
    expect(
      otilganUnitlar([
        { unitId: 1, tugagan: true },
        { unitId: 1, tugagan: true },
        { unitId: 2, tugagan: true },
        { unitId: 2, tugagan: false },
      ]),
    ).toEqual([1]);
  });
});
