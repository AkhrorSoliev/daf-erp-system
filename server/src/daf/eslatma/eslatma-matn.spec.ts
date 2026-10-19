import { NISHON_KATALOGI } from '../nishon/nishon-katalogi';
import {
  ESLATMA_HAVOLA,
  KEYINROQ,
  SIZGA_EMAS,
  TOXTATILDI,
  TOXTATISH_MATNI,
  haftalikMatn,
  kechkiMatn,
  nishonNomi,
  toxtatishKimniki,
  toxtatishTugmasi,
  type HaftalikMalumot,
} from './eslatma-matn';

const TOLIQ: HaftalikMalumot = {
  ism: 'Aziza',
  ball: 340,
  liga: { tier: 0, orin: 2, kotarildi: true },
  guruh: { orin: 3, jami: 12 },
  nishonlar: ['SERIE_7', 'WOERTER_150'],
};

describe('kechkiMatn — spec S4 §1.2', () => {
  it('seriya ≥ 2 — seriyali matn, aynan', () => {
    expect(kechkiMatn({ ism: 'Aziza', seriya: 5, maqsadBall: 80 })).toBe(
      'Assalomu alaykum, Aziza! Bugun hali mashq qilmadingiz — 5 kunlik seriyangiz davom etishi uchun bitta qisqa seans yetadi (taxminan 5 daqiqa). Bugungi maqsad: 80 ball. Davom etish: https://student.dafzentrum.uz/portal/lernen Rahmat!',
    );
  });

  it.each([0, 1])('seriya %i — seriyasiz matn, aynan', (seriya) => {
    expect(kechkiMatn({ ism: 'Aziza', seriya, maqsadBall: 160 })).toBe(
      "Assalomu alaykum, Aziza! Nemis so'zlaringiz xotirada qolishi uchun bugun bir qisqa seans yetadi. Bugungi maqsad: 160 ball. Davom etish: https://student.dafzentrum.uz/portal/lernen Rahmat!",
    );
  });

  it('seriya 2 — seriyali', () => {
    expect(kechkiMatn({ ism: 'Aziza', seriya: 2, maqsadBall: 40 })).toContain(
      '2 kunlik seriyangiz',
    );
  });
});

describe('haftalikMatn — spec S4 §2', () => {
  it('hamma qator bilan, aynan', () => {
    expect(haftalikMatn(TOLIQ)).toBe(
      [
        "Assalomu alaykum, Aziza! O'tgan hafta natijalaringiz:",
        '• Topilgan ball: 340',
        "• Liga: Bronza, xonada 2-o'rin. Tabriklaymiz, Kumush ligasiga ko'tarildingiz!",
        "• Guruhingiz: 3-o'rin, jami 12 guruhdan",
        "• Yangi nishonlar: 7 kun ketma-ket, 150 ta so'z",
        'Yangi haftada omad! Davom etish: https://student.dafzentrum.uz/portal/lernen',
      ].join('\n'),
    );
  });

  it("faqat ball qatori — liga, guruh, nishon yo'q", () => {
    expect(
      haftalikMatn({ ...TOLIQ, liga: null, guruh: null, nishonlar: [] }),
    ).toBe(
      [
        "Assalomu alaykum, Aziza! O'tgan hafta natijalaringiz:",
        '• Topilgan ball: 340',
        'Yangi haftada omad! Davom etish: https://student.dafzentrum.uz/portal/lernen',
      ].join('\n'),
    );
  });

  it("ko'tarilmagan liga — tabrik yo'q", () => {
    const m = haftalikMatn({
      ...TOLIQ,
      liga: { tier: 2, orin: 7, kotarildi: false },
    });
    expect(m).toContain("• Liga: Oltin, xonada 7-o'rin\n");
    expect(m).not.toContain('Tabriklaymiz');
  });
});

describe('umumiy', () => {
  it('ism HTML-escape va qisqartiriladi; bo`sh ism — vergulsiz salom', () => {
    expect(
      kechkiMatn({ ism: ' <b>Ali & Vali</b> ', seriya: 0, maqsadBall: 80 }),
    ).toMatch(/^Assalomu alaykum, &lt;b&gt;Ali &amp; Vali&lt;\/b&gt;! /);
    expect(kechkiMatn({ ism: '   ', seriya: 0, maqsadBall: 80 })).toMatch(
      /^Assalomu alaykum! Nemis/,
    );
    const uzun = kechkiMatn({
      ism: 'A'.repeat(100),
      seriya: 0,
      maqsadBall: 80,
    });
    expect(uzun).toContain(`${'A'.repeat(64)}!`);
    expect(uzun).not.toContain('A'.repeat(65));
  });

  it('eng uzun xabar ham 4 096 belgidan qisqa', () => {
    const ism = '&'.repeat(5000);
    expect(
      kechkiMatn({ ism, seriya: 99_999, maqsadBall: 160 }).length,
    ).toBeLessThan(4096);
    expect(
      haftalikMatn({
        ism,
        ball: 99_999_999,
        liga: { tier: 3, orin: 30, kotarildi: true },
        guruh: { orin: 999, jami: 999 },
        nishonlar: NISHON_KATALOGI.map((n) => n.key),
      }).length,
    ).toBeLessThan(4096);
  });

  it("inglizcha so'z yo'q", () => {
    const hammasi = [
      kechkiMatn({ ism: 'Aziza', seriya: 3, maqsadBall: 80 }),
      kechkiMatn({ ism: 'Aziza', seriya: 0, maqsadBall: 80 }),
      haftalikMatn(TOLIQ),
      TOXTATISH_MATNI,
      TOXTATILDI,
      SIZGA_EMAS,
      KEYINROQ,
    ]
      .join('\n')
      .split(ESLATMA_HAVOLA)
      .join('');
    expect(hammasi).not.toMatch(
      /\b(streak|reminder|badge|league|points?|session|summary|stop|goal)\b/i,
    );
  });

  it('nishon nomlari mijozniki bilan bir xil (`client/.../lernen/nishon.ts`)', () => {
    expect(
      [
        'SERIE_7',
        'WOERTER_150',
        'WOERTER_592',
        'LIGA_KUMUSH',
        'XONA_GOLIB',
        'GURUH_BIRINCHI',
        'NOMA_LUM',
      ].map(nishonNomi),
    ).toEqual([
      '7 kun ketma-ket',
      "150 ta so'z",
      "A1 so'zlarining hammasi",
      'Kumush ligasi',
      "Xona g'olibi",
      "Guruhlar jadvalida 1-o'rin",
      'NOMA_LUM',
    ]);
    for (const n of NISHON_KATALOGI) expect(nishonNomi(n.key)).not.toBe(n.key);
  });

  it('tugma: «Eslatmalarni to`xtatish», dr:off:<id>, 64 baytdan qisqa', () => {
    expect(toxtatishTugmasi(10001)).toEqual({
      inline_keyboard: [
        [{ text: "Eslatmalarni to'xtatish", callback_data: 'dr:off:10001' }],
      ],
    });
    expect(toxtatishTugmasi(2147483647).inline_keyboard[0][0]).toEqual({
      text: "Eslatmalarni to'xtatish",
      callback_data: 'dr:off:2147483647',
    });
    expect(Buffer.byteLength('dr:off:2147483647')).toBeLessThanOrEqual(64);
  });

  it('toxtatishKimniki — faqat dr:off:<musbat int4>', () => {
    expect(toxtatishKimniki('dr:off:10001')).toBe(10001);
    expect(toxtatishKimniki('dr:off:2147483647')).toBe(2147483647);
    for (const yomon of [
      'dr:off:0',
      'dr:off:abc',
      'dr:off:12x',
      'dr:off:9999999999',
      'dr:off:',
      'lr:abc:5',
    ]) {
      expect(toxtatishKimniki(yomon)).toBeNull();
    }
  });
});
