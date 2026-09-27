import { describe, expect, it } from "vitest";
import { yolSkrollSiljishi, type YolSkrollOlchami } from "./yol-skroll";

// Telefon: 800 px oyna, tepada 24 px, pastda 128 px (navigatsiya) band —
// ko'rinadigan qism 24..672, balandligi 648.
const olcham = (o: Partial<YolSkrollOlchami>): YolSkrollOlchami => ({
  unitTepa: 0,
  seansTepa: 0,
  seansPast: 0,
  oyna: 800,
  tepaZaxira: 24,
  pastZaxira: 128,
  ...o,
});

describe("yolSkrollSiljishi", () => {
  it("seans ekranda ko'rinib tursa — joyida qoladi", () => {
    // Yangi o'quvchi: birinchi unit sahifa ochilganda ko'rinib turibdi.
    expect(
      yolSkrollSiljishi(olcham({ unitTepa: 300, seansTepa: 360, seansPast: 520 })),
    ).toBeNull();
  });

  it("seans pastki navigatsiya ORTIDA qolsa — ko'rinmagan hisoblanadi", () => {
    // 700 > 672: tugun oynada, lekin navigatsiya uni yopib turibdi.
    expect(
      yolSkrollSiljishi(olcham({ unitTepa: 400, seansTepa: 540, seansPast: 700 })),
    ).toBe(400 - 24);
  });

  it("unit sarlavhasi va seans birga sig'sa — sarlavha tepaga keladi", () => {
    expect(
      yolSkrollSiljishi(olcham({ unitTepa: 2000, seansTepa: 2400, seansPast: 2560 })),
    ).toBe(2000 - 24);
  });

  it("aynan sig'adigan chegarada ham unit tepaga keladi", () => {
    // 2648 - 2000 = 648 — ko'rinadigan qismning to'liq balandligi.
    expect(
      yolSkrollSiljishi(olcham({ unitTepa: 2000, seansTepa: 2488, seansPast: 2648 })),
    ).toBe(2000 - 24);
  });

  it("sig'masa — seans ko'rinadigan qismning o'rtasiga keladi", () => {
    // Unit uzun: sarlavha tepaga qo'yilsa seans ekrandan chiqib ketardi.
    const siljish = yolSkrollSiljishi(
      olcham({ unitTepa: 2000, seansTepa: 3000, seansPast: 3160 }),
    );
    // Seans o'rtasi 3080, ko'rinadigan qism o'rtasi (24 + 672) / 2 = 348.
    expect(siljish).toBe(3080 - 348);
    const yangiOrta = (3000 + 3160) / 2 - siljish!;
    expect(yangiOrta).toBe(348);
  });

  it("seans tepada, ko'rinmay qolgan bo'lsa — orqaga (tepaga) suradi", () => {
    // Orqaga qaytilganda brauzer eski skrollni tiklagan va seans tepada
    // qolib ketgan holat.
    expect(
      yolSkrollSiljishi(olcham({ unitTepa: -600, seansTepa: -300, seansPast: -140 })),
    ).toBe(-600 - 24);
  });
});
