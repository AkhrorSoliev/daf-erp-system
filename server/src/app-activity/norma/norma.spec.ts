import {
  faolKunmi,
  HOLAT_TARTIBI,
  holat,
  kerakliKunlar,
  normaniOqi,
  STANDART_NORMA,
} from './norma';

describe('faolKunmi — kun faolmi (dizayn 3.3)', () => {
  const n = STANDART_NORMA; // 10 daqiqa / 12 savol

  it("vaqt yetsa savol bo'lmasa ham faol", () => {
    expect(faolKunmi(600, 0, n)).toBe(true);
  });

  it("savol yetsa vaqt kam bo'lsa ham faol — tez o'quvchi jazolanmaydi", () => {
    expect(faolKunmi(0, 12, n)).toBe(true);
  });

  it('ikkalasi ham chegaradan bir kam — faol emas', () => {
    expect(faolKunmi(599, 11, n)).toBe(false);
  });

  it("chegaraning o'zi yetadi (>=)", () => {
    expect(faolKunmi(600, 11, n)).toBe(true);
    expect(faolKunmi(599, 12, n)).toBe(true);
  });
});

describe('kerakliKunlar — norma davrga mutanosib (dizayn 3.4)', () => {
  const n = STANDART_NORMA; // 4 / 2

  it('7 kunlik maxraj — normaning o\'si', () => {
    expect(kerakliKunlar(7, n)).toEqual({ kerakliKun: 4, sariqKerak: 2 });
  });

  it("30 kunlik to'liq maxraj — 4 → 17, 2 → 9", () => {
    expect(kerakliKunlar(30, n)).toEqual({ kerakliKun: 17, sariqKerak: 9 });
  });

  it('3 kunlik maxraj — 2 va 1', () => {
    expect(kerakliKunlar(3, n)).toEqual({ kerakliKun: 2, sariqKerak: 1 });
  });

  it("maxraj 1 bo'lsa eng kami 1 — 0 bo'lib qolmaydi", () => {
    expect(kerakliKunlar(1, n)).toEqual({ kerakliKun: 1, sariqKerak: 1 });
  });

  it('maxraj 0 yoki manfiy kelsa 1 deb olinadi', () => {
    expect(kerakliKunlar(0, n)).toEqual({ kerakliKun: 1, sariqKerak: 1 });
  });
});

describe('holat — belgi (dizayn 3.4)', () => {
  const n = STANDART_NORMA;
  const bor = { akkaunt: true, hechKirmagan: false, maxraj: 7 };

  it("akkaunt yo'q — faol kun qanchaligi muhim emas", () => {
    expect(holat({ ...bor, akkaunt: false, faolKun: 7 }, n)).toBe('AKKAUNT_YOQ');
  });

  it('hech qachon kirmagan — normadan oldin tekshiriladi', () => {
    expect(holat({ ...bor, hechKirmagan: true, faolKun: 0 }, n)).toBe('HECH_KIRMAGAN');
  });

  it('chegaralar: 0,1 qizil; 2,3 sariq; 4+ yashil', () => {
    expect(holat({ ...bor, faolKun: 0 }, n)).toBe('QIZIL');
    expect(holat({ ...bor, faolKun: 1 }, n)).toBe('QIZIL');
    expect(holat({ ...bor, faolKun: 2 }, n)).toBe('SARIQ');
    expect(holat({ ...bor, faolKun: 3 }, n)).toBe('SARIQ');
    expect(holat({ ...bor, faolKun: 4 }, n)).toBe('YASHIL');
    expect(holat({ ...bor, faolKun: 7 }, n)).toBe('YASHIL');
  });

  it("30 kunlik maxrajda 17 yashil, 16 sariq", () => {
    expect(holat({ ...bor, maxraj: 30, faolKun: 17 }, n)).toBe('YASHIL');
    expect(holat({ ...bor, maxraj: 30, faolKun: 16 }, n)).toBe('SARIQ');
  });

  it("standart saralash tartibi: hech kirmagan → qizil → sariq → yashil → akkaunt yo'q", () => {
    expect(HOLAT_TARTIBI.HECH_KIRMAGAN).toBeLessThan(HOLAT_TARTIBI.QIZIL);
    expect(HOLAT_TARTIBI.QIZIL).toBeLessThan(HOLAT_TARTIBI.SARIQ);
    expect(HOLAT_TARTIBI.SARIQ).toBeLessThan(HOLAT_TARTIBI.YASHIL);
    expect(HOLAT_TARTIBI.YASHIL).toBeLessThan(HOLAT_TARTIBI.AKKAUNT_YOQ);
  });
});

describe('normaniOqi — Company ustunlaridan', () => {
  it('nomlarni tarjima qiladi', () => {
    expect(
      normaniOqi({ dafKunlikDaqiqa: 15, dafKunlikSavol: 20, dafHaftalikKun: 5, dafSariqKun: 3 }),
    ).toEqual({ kunlikDaqiqa: 15, kunlikSavol: 20, haftalikKun: 5, sariqKun: 3 });
  });
});
