import { describe, expect, it } from "vitest";
import { sinovKorinishi } from "./sinov-natijasi";

const natija = (
  o: Partial<{ bestanden: boolean; avvalOtilgan: boolean; togri: number }>,
) => ({
  bestanden: false,
  avvalOtilgan: false,
  togri: 12,
  jami: 15,
  kerak: 14,
  ...o,
});

describe("sinovKorinishi", () => {
  it("server javobi kutilmoqda — tugma yo'q, o'tdi/o'tmadi taxmin qilinmaydi", () => {
    expect(sinovKorinishi({ tur: "kutilmoqda" })).toEqual({
      sarlavha: "Natija tekshirilmoqda",
      matn: "Bir necha soniya kuting.",
      ohang: "neytral",
      asosiy: null,
    });
  });

  it("so'rov yiqildi — qayta yuborish", () => {
    const k = sinovKorinishi({ tur: "xato" });
    expect(k.asosiy).toBe("qayta-yubor");
    expect(k.ohang).toBe("xavf");
  });

  it("o'tdi — davom etish, keyingi unit ochildi", () => {
    expect(
      sinovKorinishi({
        tur: "tayyor",
        natija: natija({ bestanden: true, togri: 14 }),
      }),
    ).toEqual({
      sarlavha: "Yakuniy sinovdan o'tdingiz!",
      matn: "14 / 15 — keyingi unit ochildi.",
      ohang: "muvaffaqiyat",
      asosiy: "davom",
    });
  });

  it("o'tmadi — qayta urinish, nechta kerakligi aytiladi", () => {
    expect(sinovKorinishi({ tur: "tayyor", natija: natija({}) })).toEqual({
      sarlavha: "Hali o'tmadingiz",
      matn: "12 / 15 — o'tish uchun kamida 14 ta to'g'ri javob kerak.",
      ohang: "xavf",
      asosiy: "qayta",
    });
  });

  it("avval o'tgan, bu safar past — unit ochiq, davom etish", () => {
    expect(
      sinovKorinishi({ tur: "tayyor", natija: natija({ avvalOtilgan: true }) }),
    ).toEqual({
      sarlavha: "Bu safar 12 / 15",
      matn: "Sinovdan avval o'tgansiz — keyingi unit ochiq.",
      ohang: "neytral",
      asosiy: "davom",
    });
  });
});
