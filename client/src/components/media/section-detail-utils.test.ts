import { describe, expect, it } from "vitest";
import {
  boshlangichFormat,
  engKopSavolliFormat,
  tanlanganTab,
} from "./section-detail-utils";
import type { FrageFormat } from "./media-fragen-types";

describe("tanlanganTab", () => {
  it("sukut — material", () => {
    expect(tanlanganTab(null)).toBe("material");
  });
  it("manzildagi qiymat o`qiladi", () => {
    expect(tanlanganTab("savollar")).toBe("savollar");
  });
  it("notanish qiymat sukutga tushadi", () => {
    // Manzil qo'lda tahrirlanishi mumkin; sahifa oq ekran bermasin.
    expect(tanlanganTab("xxx")).toBe("material");
  });
});

describe("boshlangichFormat", () => {
  // ARTIKEL ATAYLAB birinchi o'rinda, lekin ENG KAM sonli (1 ta) — WORT_UZ
  // ortda (3 ta), lekin ENG KO'P sonli. Ko'rikda topilgan kamchilik: eski
  // fixture'da eng ko'p guruh HAM birinchi edi, shuning uchun `f[0].format`
  // qaytaradigan noto'g'ri implementatsiya ham barcha 4 testdan o'tardi —
  // "eng katta guruh" qoidasi haqiqatda tekshirilmagan edi. Tartib shu
  // sababli teskari qilindi: endi "birinchi" va "eng ko'p" ikki xil
  // element, shuning uchun test ikkalasini chalkashtirgan implementatsiyani
  // ushlaydi.
  const f = [
    { format: "ARTIKEL" },
    { format: "WORT_UZ" }, { format: "WORT_UZ" }, { format: "WORT_UZ" },
  ] as any;

  it("manzilda format bo`lsa o`sha", () => {
    expect(boshlangichFormat(f, "ARTIKEL")).toBe("ARTIKEL");
  });

  it("manzilda yo`q bo`lsa ENG KO`P savolli format", () => {
    // Bo'sh ekran bilan boshlash odamni "endi nima bosaman?" holatiga
    // qo'yadi. Eng katta guruh — eng foydali boshlang'ich. `f[0]` bo'lsa
    // edi bu test "ARTIKEL" kutgan bo'lardi — u yo'q, demak bu chindan
    // sonlarni hisoblayotganini tekshiradi.
    expect(boshlangichFormat(f, null)).toBe("WORT_UZ");
  });

  it("manzildagi format bu bo`limda yo`q bo`lsa ENG KO`P savollisiga tushadi", () => {
    // Havola boshqa bo'limdan ko'chirilgan bo'lishi mumkin.
    expect(boshlangichFormat(f, "DIALOG_LUECKE")).toBe("WORT_UZ");
  });

  it("savol umuman bo`lmasa null", () => {
    expect(boshlangichFormat([], null)).toBeNull();
  });
});

describe("engKopSavolliFormat", () => {
  // `boshlangichFormat` ichida ishlatiladigan yadro, lekin
  // `section-detail-client.tsx` uni TO'G'RIDAN-TO'G'RI ham chaqiradi
  // ("bosilgan format sukutga tengmi" tekshiruvi) — shuning uchun
  // o'zining testi kerak, `boshlangichFormat`ning 4 testi uni faqat
  // bilvosita qamraydi.
  it("eng ko`p sonlisini tanlaydi", () => {
    const hisoblar: [FrageFormat, number][] = [
      ["ARTIKEL", 1],
      ["WORT_UZ", 5],
      ["PAAR", 2],
    ];
    expect(engKopSavolliFormat(hisoblar)).toBe("WORT_UZ");
  });

  it("miqdorlar teng bo`lsa BIRINCHI uchragani g`olib chiqadi", () => {
    // Determinizm uchun — natija tasodifiy bo'lmasin. "Birinchi" — server
    // javobidagi (demak `VORSCHAU_BAUER` e'lon tartibidagi) ketma-ketlik.
    const hisoblar: [FrageFormat, number][] = [
      ["ARTIKEL", 3],
      ["WORT_UZ", 3],
    ];
    expect(engKopSavolliFormat(hisoblar)).toBe("ARTIKEL");
  });

  it("bo`sh bo`lsa null", () => {
    expect(engKopSavolliFormat([])).toBeNull();
  });
});
