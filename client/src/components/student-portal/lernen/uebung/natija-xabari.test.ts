import { describe, expect, it } from "vitest";
import { orinXabari, xatoYorligi } from "./natija-xabari";

describe("orinXabari", () => {
  it("ko'tarilganda nechta pog'ona ko'tarilganini aytadi", () => {
    expect(orinXabari(5, 3)).toBe("Guruhda 3-o'rin — 2 pog'ona ko'tarildingiz");
  });

  it("tushganda ham aytadi", () => {
    expect(orinXabari(3, 5)).toBe("Guruhda 5-o'rin — 2 pog'ona tushdingiz");
  });

  it("o'rin o'zgarmagan bo'lsa HECH NARSA aytmaydi", () => {
    // Har safar "3-o'rin" deb turaversa u shovqinga aylanadi va
    // o'quvchi e'tibor bermay qo'yadi.
    expect(orinXabari(3, 3)).toBeNull();
  });

  it("birinchi marta jadvalga tushganda o'rinni aytadi", () => {
    expect(orinXabari(null, 4)).toBe("Guruhda 4-o'rin");
  });

  it("o'rin noma'lum bo'lsa jim turadi", () => {
    expect(orinXabari(3, null)).toBeNull();
    expect(orinXabari(null, null)).toBeNull();
  });
});

describe("xatoYorligi", () => {
  it("AUDIO_WORT uchun sobit yorliq qaytaradi, promptni emas", () => {
    // Server bu format uchun `prompt`ni ATAYLAB bo'sh yuboradi (so'zning
    // o'zi javob) — bo'sh qatorni chizish o'rniga qat'iy yorliq kerak.
    expect(xatoYorligi("AUDIO_WORT", "")).toBe("Eshitish savoli");
  });

  it("WORT_TIPPEN uchun ham xuddi shu yorliq", () => {
    expect(xatoYorligi("WORT_TIPPEN", "")).toBe("Eshitish savoli");
  });

  it("qolgan formatlarda promptning o'zini qaytaradi", () => {
    expect(xatoYorligi("WORT_UZ", "Bu so'z nimani anglatadi?")).toBe(
      "Bu so'z nimani anglatadi?",
    );
    expect(xatoYorligi("LUECKE", "Ich ___ Student.")).toBe("Ich ___ Student.");
  });
});
