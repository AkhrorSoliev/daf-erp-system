import {
  CHEGARA_OYNA_KUN,
  ESLATMA_OYNA_KUN,
  HAFTALIK_CHEGARA,
  JURNAL_SAQLASH_KUN,
  PAUZA_MS,
  eslatmaRejimi,
  haftalikNomzodmi,
  haftalikQaror,
  kechkiNomzodmi,
  kechkiSanalar,
  otganHafta,
  toshkentSoati,
  tozalashChegarasi,
  type HaftalikFakt,
  type JurnalYozuvi,
  type KechkiFakt,
} from './eslatma-qoidalari';

const BUGUN = '2026-10-21'; // chorshanba
const DUSHANBA = '2026-10-19';

const kechki = (o: Partial<KechkiFakt> = {}): KechkiFakt => ({
  ochirilgan: false,
  chatId: '555',
  uzilgan: false,
  eslatmalar: true,
  jurnal: [],
  kunlar: ['2026-10-20'],
  ...o,
});

const haftalik = (o: Partial<HaftalikFakt> = {}): HaftalikFakt => ({
  ochirilgan: false,
  chatId: '555',
  uzilgan: false,
  eslatmalar: true,
  jurnal: [],
  otganHaftaBall: 40,
  ...o,
});

const yozuv = (
  kind: JurnalYozuvi['kind'],
  sentOn: string,
  status: JurnalYozuvi['status'] = 'SENT',
): JurnalYozuvi => ({ kind, sentOn, status });

describe('chegaralar va sanalar', () => {
  it('spec S4 qiymatlari', () => {
    expect([
      ESLATMA_OYNA_KUN,
      HAFTALIK_CHEGARA,
      CHEGARA_OYNA_KUN,
      PAUZA_MS,
      JURNAL_SAQLASH_KUN,
    ]).toEqual([14, 4, 7, 60, 90]);
  });

  it.each<[string | undefined, string]>([
    [undefined, 'off'],
    ['', 'off'],
    ['yes', 'off'],
    ['ON', 'on'],
    [' log ', 'log'],
  ])('DAF_ESLATMALAR=%p → %s', (raw, rejim) => {
    expect(eslatmaRejimi(raw)).toBe(rejim);
  });

  it('14 kunlik oyna bugungidan tashqari, 7 kunlik oyna bugun bilan; o`tgan hafta; 90 kun', () => {
    expect(kechkiSanalar(BUGUN)).toEqual({
      bugun: BUGUN,
      kecha: '2026-10-20',
      oynaBoshi: '2026-10-07',
      chegaraBoshi: '2026-10-15',
    });
    expect(otganHafta(DUSHANBA)).toEqual({
      otgan: '2026-10-12',
      bugun: DUSHANBA,
    });
    expect(tozalashChegarasi(BUGUN)).toBe('2026-07-23');
  });
});

describe('kechkiNomzodmi — spec S4 §1.1', () => {
  it("faol, botga ulangan, kecha mashq qilgan, bugun hali yo'q — oladi", () => {
    expect(kechkiNomzodmi(kechki(), BUGUN)).toBe(true);
  });

  it.each<[string, Partial<KechkiFakt>]>([
    ["o'chirilgan", { ochirilgan: true }],
    ['botga ulanmagan', { chatId: null }],
    ['chat uzilgan', { uzilgan: true }],
    ["eslatmalar o'chirilgan", { eslatmalar: false }],
  ])('%s — olmaydi', (_nima, o) => {
    expect(kechkiNomzodmi(kechki(o), BUGUN)).toBe(false);
  });

  it('14 kun: 14 kun oldingi qator yetadi, 15 kun oldingisi yetmaydi', () => {
    expect(kechkiNomzodmi(kechki({ kunlar: ['2026-10-07'] }), BUGUN)).toBe(
      true,
    );
    expect(kechkiNomzodmi(kechki({ kunlar: ['2026-10-06'] }), BUGUN)).toBe(
      false,
    );
    expect(kechkiNomzodmi(kechki({ kunlar: [] }), BUGUN)).toBe(false);
  });

  it('bugun qatori bor (nol ballik urinish ham mashq) — olmaydi', () => {
    expect(
      kechkiNomzodmi(kechki({ kunlar: ['2026-10-20', BUGUN] }), BUGUN),
    ).toBe(false);
  });

  it("ketma-ket ikki kun yo'q: kecha SENT — olmaydi, kecha FAILED — oladi", () => {
    expect(
      kechkiNomzodmi(
        kechki({ jurnal: [yozuv('EVENING', '2026-10-20')] }),
        BUGUN,
      ),
    ).toBe(false);
    expect(
      kechkiNomzodmi(
        kechki({ jurnal: [yozuv('EVENING', '2026-10-20', 'FAILED')] }),
        BUGUN,
      ),
    ).toBe(true);
  });

  it('7 kunda 4 tagacha: oynada 4 SENT — olmaydi; oynadan tashqarisi va FAILED sanalmaydi', () => {
    const sent = (...kunlar: string[]) =>
      kunlar.map((d) => yozuv('EVENING', d));
    expect(
      kechkiNomzodmi(
        kechki({
          jurnal: sent('2026-10-15', '2026-10-16', '2026-10-17', '2026-10-19'),
        }),
        BUGUN,
      ),
    ).toBe(false);
    expect(
      kechkiNomzodmi(
        kechki({
          jurnal: sent('2026-10-14', '2026-10-15', '2026-10-17', '2026-10-19'),
        }),
        BUGUN,
      ),
    ).toBe(true);
    expect(
      kechkiNomzodmi(
        kechki({
          jurnal: [
            ...sent('2026-10-15', '2026-10-17', '2026-10-19'),
            yozuv('EVENING', '2026-10-16', 'FAILED'),
          ],
        }),
        BUGUN,
      ),
    ).toBe(true);
  });

  it('bugun allaqachon egallangan (FAILED ham) — qayta yuborilmaydi', () => {
    expect(
      kechkiNomzodmi(
        kechki({ jurnal: [yozuv('EVENING', BUGUN, 'FAILED')] }),
        BUGUN,
      ),
    ).toBe(false);
  });

  it("dushanba xulosasi olgan kuni kechki yo'q; xulosa FAILED bo'lsa — bor", () => {
    const f = (status: JurnalYozuvi['status']) =>
      kechki({
        kunlar: ['2026-10-17'],
        jurnal: [yozuv('WEEKLY', DUSHANBA, status)],
      });
    expect(kechkiNomzodmi(f('SENT'), DUSHANBA)).toBe(false);
    expect(kechkiNomzodmi(f('FAILED'), DUSHANBA)).toBe(true);
  });
});

describe('haftalikNomzodmi — spec S4 §2', () => {
  it("o'tgan hafta kamida 1 ball — oladi, 0 — yo'q", () => {
    expect(haftalikNomzodmi(haftalik({ otganHaftaBall: 1 }), DUSHANBA)).toBe(
      true,
    );
    expect(haftalikNomzodmi(haftalik({ otganHaftaBall: 0 }), DUSHANBA)).toBe(
      false,
    );
  });

  it("shu dushanba qatori bor (FAILED ham) — ikkinchisi yo'q; o'tgan dushanbaniki to'smaydi", () => {
    expect(
      haftalikNomzodmi(
        haftalik({ jurnal: [yozuv('WEEKLY', DUSHANBA, 'FAILED')] }),
        DUSHANBA,
      ),
    ).toBe(false);
    expect(
      haftalikNomzodmi(
        haftalik({ jurnal: [yozuv('WEEKLY', '2026-10-12')] }),
        DUSHANBA,
      ),
    ).toBe(true);
  });

  it("uzilgan chat va o'chirilgan eslatmalar — yo'q", () => {
    expect(haftalikNomzodmi(haftalik({ uzilgan: true }), DUSHANBA)).toBe(false);
    expect(haftalikNomzodmi(haftalik({ eslatmalar: false }), DUSHANBA)).toBe(
      false,
    );
  });
});

describe('tayyorlik qarori va soat', () => {
  it('tayyor — yubor; tayyor emas — 18:00 gacha kut, 18:00 da tashla', () => {
    expect(haftalikQaror(9, true)).toBe('yubor');
    expect(haftalikQaror(18, true)).toBe('yubor');
    expect(haftalikQaror(9, false)).toBe('kut');
    expect(haftalikQaror(17, false)).toBe('kut');
    expect(haftalikQaror(18, false)).toBe('tashla');
  });

  it('Toshkent soati (UTC+5)', () => {
    expect(toshkentSoati(new Date('2026-10-19T04:00:00Z'))).toBe(9);
    expect(toshkentSoati(new Date('2026-10-19T13:00:00Z'))).toBe(18);
    expect(toshkentSoati(new Date('2026-10-18T19:30:00Z'))).toBe(0);
  });
});
