import { describe, expect, it } from "vitest";
import { tanlanganTab, boshlangichFormat } from "./section-detail-utils";

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
  const f = [
    { format: "WORT_UZ" }, { format: "WORT_UZ" }, { format: "WORT_UZ" },
    { format: "ARTIKEL" },
  ] as any;

  it("manzilda format bo`lsa o`sha", () => {
    expect(boshlangichFormat(f, "ARTIKEL")).toBe("ARTIKEL");
  });

  it("manzilda yo`q bo`lsa ENG KO`P savolli format", () => {
    // Bo'sh ekran bilan boshlash odamni "endi nima bosaman?" holatiga
    // qo'yadi. Eng katta guruh — eng foydali boshlang'ich.
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
