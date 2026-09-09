import { describe, expect, it } from "vitest";
import {
  formatlarBoyichaGuruhla,
  juftlarniAjrat,
  vorschauShakli,
} from "./media-fragen-utils";
import type { VorschauFrage } from "./media-fragen-types";

describe("vorschauShakli", () => {
  it("audio formatlarda karnay ko`rsatiladi", () => {
    // `prompt` audio formatlarda ATAYLAB bo'sh — so'z javobning o'zi.
    // Panel matn o'rniga ovozni ko'rsatishi kerak, aks holda savol
    // bo'sh qator bo'lib chiqardi.
    expect(vorschauShakli("AUDIO_WORT")).toBe("OVOZ");
    expect(vorschauShakli("WORT_TIPPEN")).toBe("OVOZ");
  });
  it("juftlash formatlarida juftlar ro`yxati", () => {
    expect(vorschauShakli("PAAR")).toBe("JUFT");
    expect(vorschauShakli("ZUORDNEN")).toBe("JUFT");
  });
  it("dialogda butun suhbat", () => {
    expect(vorschauShakli("DIALOG_LUECKE")).toBe("DIALOG");
  });
  it("qolganida oddiy matn", () => {
    expect(vorschauShakli("WORT_UZ")).toBe("MATN");
    expect(vorschauShakli("LUECKE")).toBe("MATN");
  });
});

describe("juftlarniAjrat", () => {
  it("`de=uz|de=uz|...`ni juftlar ro`yxatiga ajratadi", () => {
    // Ko'rik topilmasi (Critical): server bu shaklni raw string sifatida
    // yozadi (`paar()`/`zuordnen()`); panel uni HECH QACHON xom holda
    // ko'rsatmasligi kerak — bir talabaga ko'rsatilgan haqiqiy defekt
    // shu edi.
    expect(juftlarniAjrat("wie=qanday|Guten Morgen=xayrli tong")).toEqual([
      { chap: "wie", ong: "qanday" },
      { chap: "Guten Morgen", ong: "xayrli tong" },
    ]);
  });

  it("`=`siz bo`lakni jimgina o`tkazib yuboradi", () => {
    // Kutilmagan shakl uchraganda panel yiqilmasin — shunchaki shu
    // bo'lak tushib qoladi, qolgan to'g'ri juftlar ko'rsatiladi.
    expect(juftlarniAjrat("a=b|malformed|c=d")).toEqual([
      { chap: "a", ong: "b" },
      { chap: "c", ong: "d" },
    ]);
  });

  it("bir nechta `=` bo`lsa FAQAT birinchisidan bo`ladi", () => {
    // O'ng tomonda `=` uchrashi kutilmaydi, lekin uchrab qolsa ham
    // birinchi `=` chegara — qolgani `ong`ga tegishli.
    expect(juftlarniAjrat("a=b=c")).toEqual([{ chap: "a", ong: "b=c" }]);
  });

  it("bo`sh satr uchun bo`sh ro`yxat qaytaradi", () => {
    expect(juftlarniAjrat("")).toEqual([]);
  });
});

/** Test uchun eng kichik `VorschauFrage` — faqat `format` ahamiyatli. */
function f(format: VorschauFrage["format"], itemId: number): VorschauFrage {
  return {
    format,
    itemType: "WORT",
    itemId,
    prompt: "p",
    hilfe: null,
    options: [],
    richtig: "r",
    audioUrl: null,
  };
}

describe("formatlarBoyichaGuruhla", () => {
  it("savollarni format bo`yicha guruhlaydi", () => {
    const guruhlar = formatlarBoyichaGuruhla([
      f("WORT_UZ", 1),
      f("PAAR", 2),
      f("WORT_UZ", 3),
    ]);
    expect(guruhlar.get("WORT_UZ")?.map((x) => x.itemId)).toEqual([1, 3]);
    expect(guruhlar.get("PAAR")?.map((x) => x.itemId)).toEqual([2]);
  });

  it("guruh tartibini BIRINCHI uchragan format bo`yicha saqlaydi", () => {
    // `VORSCHAU_BAUER` e'lon tartibiga mos kelishi kerak — CEO
    // ro'yxatni har safar boshqa tartibda ko'rmasin.
    const guruhlar = formatlarBoyichaGuruhla([
      f("ZUORDNEN", 1),
      f("WORT_UZ", 2),
      f("ZUORDNEN", 3),
    ]);
    expect([...guruhlar.keys()]).toEqual(["ZUORDNEN", "WORT_UZ"]);
  });
});
