import { describe, expect, it } from "vitest";
import { ajratDialogQatorlari } from "./dialog-blok";

/**
 * `ajratDialogQatorlari` — server yuborgan `Sprecher: matn` satrlarini
 * `DialogBlok` chizadigan shaklga ajratadi. Komponentning o'zi
 * (`dialog-blok.tsx`) render qilinmaydi — bu loyihada JSX render
 * testlari yo'q (`vitest.config.mts`), shuning uchun butun mantiq shu
 * sof funksiyada, alohida sinaladi.
 */
describe("ajratDialogQatorlari", () => {
  it("gapiruvchi va matnni birinchi ikki nuqtadan ajratadi", () => {
    const natija = ajratDialogQatorlari("Anna: Guten Tag!");
    expect(natija).toEqual([{ sprecher: "Anna", matn: "Guten Tag!", boshMi: false }]);
  });

  it("matn ICHIDA yana ikki nuqta bo'lsa ham, FAQAT birinchisidan ajratadi", () => {
    // Soat vaqti kabi ikkinchi ":" ni gapiruvchi nomining bir qismi qilib
    // olmasligi kerak — aks holda "Es ist 10:30 Uhr" "30 Uhr" ga qisqarib
    // qolardi.
    const natija = ajratDialogQatorlari("Anna: Es ist 10:30 Uhr");
    expect(natija).toEqual([{ sprecher: "Anna", matn: "Es ist 10:30 Uhr", boshMi: false }]);
  });

  it("ikki nuqta topilmasa butun satrni matn sifatida qaytaradi", () => {
    // Server shaklini o'zgartirsa ham ekran buzilmasligi kerak (brief §5).
    const natija = ajratDialogQatorlari("Bu oddiy izoh qatori");
    expect(natija).toEqual([{ sprecher: null, matn: "Bu oddiy izoh qatori", boshMi: false }]);
  });

  it("bo'sh joy (___) bo'lgan satrni belgilaydi", () => {
    const natija = ajratDialogQatorlari("Anna: ___");
    expect(natija[0].boshMi).toBe(true);
  });

  it("bo'sh joysiz satrlarni belgilamaydi", () => {
    const natija = ajratDialogQatorlari("Anna: Guten Tag!");
    expect(natija[0].boshMi).toBe(false);
  });

  it("bir necha satrni tartibda ajratadi", () => {
    const matn = "Anna: Guten Tag!\nBen: ___\nAnna: Danke, gut.";
    const natija = ajratDialogQatorlari(matn);
    expect(natija).toEqual([
      { sprecher: "Anna", matn: "Guten Tag!", boshMi: false },
      { sprecher: "Ben", matn: "___", boshMi: true },
      { sprecher: "Anna", matn: "Danke, gut.", boshMi: false },
    ]);
  });
});
