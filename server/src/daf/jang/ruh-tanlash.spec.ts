import { ruhniTanla, type RuhNomzodi, type RuhSharti } from './ruh-tanlash';

const savollar = [1, 2, 3, 4, 5, 6];
const nom = (o: Partial<RuhNomzodi> = {}): RuhNomzodi => ({
  battleId: 100,
  studentId: 20,
  questionIds: savollar,
  egaKuchi: 0.6,
  ...o,
});
const shart = (o: Partial<RuhSharti> = {}): RuhSharti => ({
  menId: 10,
  menKuchi: 0.6,
  ruxsatSavollar: new Set([...savollar, 7, 8]),
  korilgan: new Set(),
  uchrashganlar: new Set(),
  ...o,
});

describe('ruhniTanla', () => {
  it('mos nomzodni oladi', () => {
    expect(ruhniTanla([nom()], shart())?.battleId).toBe(100);
  });
  it("o'zi bo'lmaydi", () => {
    expect(ruhniTanla([nom({ studentId: 10 })], shart())).toBeNull();
  });
  it("o'tilmagan unit savoli bo'lsa — yo'q", () => {
    expect(
      ruhniTanla([nom({ questionIds: [1, 2, 3, 4, 5, 99] })], shart()),
    ).toBeNull();
  });
  it("yaqinda ko'rilgan savol bo'lsa — yo'q", () => {
    expect(ruhniTanla([nom()], shart({ korilgan: new Set([3]) }))).toBeNull();
  });
  it("kuch ±0.15 dan tashqari — yo'q, chegarada — ha", () => {
    expect(ruhniTanla([nom({ egaKuchi: 0.8 })], shart())).toBeNull();
    expect(ruhniTanla([nom({ egaKuchi: 0.75 })], shart())).not.toBeNull();
  });
  it("7 kunda uchrashgan ega — yo'q", () => {
    expect(
      ruhniTanla([nom()], shart({ uchrashganlar: new Set([20]) })),
    ).toBeNull();
  });
  it("6 savoli to'liq bo'lmagan jang — yo'q", () => {
    expect(ruhniTanla([nom({ questionIds: [1, 2, 3] })], shart())).toBeNull();
  });
});
