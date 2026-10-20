import { describe, expect, it } from "vitest";
import { javobPaneliMatni, natijaQatorlari, orinXabari, xatoYorligi } from "./natija-xabari";

describe("javobPaneliMatni", () => {
  it("a slip counts as correct and shows the right spelling", () => {
    expect(
      javobPaneliMatni({ isCorrect: true, richtig: "Bahnhof", tippfehler: true }),
    ).toEqual({ sarlavha: "To'g'ri!", izoh: "Imlosiga e'tibor bering:", soz: "Bahnhof" });
  });

  it("a plain correct answer shows no word", () => {
    expect(javobPaneliMatni({ isCorrect: true, richtig: "Bahnhof" })).toEqual({
      sarlavha: "To'g'ri!",
      izoh: null,
      soz: null,
    });
  });

  it("a wrong answer shows the right one", () => {
    expect(javobPaneliMatni({ isCorrect: false, richtig: "Bahnhof" })).toEqual({
      sarlavha: "Xato",
      izoh: null,
      soz: "Bahnhof",
    });
  });

  it("a picture answer shows the word, never the picture URL", () => {
    const natija = { isCorrect: false, richtig: "https://x/b.jpg", loesungWort: "der Bahnhof" };
    expect(javobPaneliMatni(natija).soz).toBe("der Bahnhof");
    expect(javobPaneliMatni({ ...natija, isCorrect: true }).soz).toBe("der Bahnhof");
  });
});

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

  it("SATZ_HOEREN uchun ham — gap promptda yo'q, u javobning o'zi", () => {
    expect(xatoYorligi("SATZ_HOEREN", "")).toBe("Eshitish savoli");
  });

  it("qolgan formatlarda promptning o'zini qaytaradi", () => {
    expect(xatoYorligi("WORT_UZ", "Bu so'z nimani anglatadi?")).toBe(
      "Bu so'z nimani anglatadi?",
    );
    expect(xatoYorligi("LUECKE", "Ich ___ Student.")).toBe("Ich ___ Student.");
  });

  // Ikkala test ham qaror FORMATga qarab qilinishini isbotlaydi, promptning
  // BO'SH-EMASLIGIGA emas — ko'rikda topilgan bo'shliq: avvalgi uch test
  // har audio holatda bo'sh prompt, har audio-bo'lmagan holatda to'ldirilgan
  // prompt bergani uchun "bo'sh bo'lsa yorliq qaytar" degan NOTO'G'RI
  // implementatsiya ham ularning barchasidan o'tardi.
  it("audio-bo'lmagan formatda prompt bo'sh bo'lsa ham bo'sh qaytadi", () => {
    expect(xatoYorligi("ZUORDNEN", "")).toBe("");
  });

  it("AUDIO_WORTda prompt to'ldirilgan bo'lsa ham sobit yorliq qaytadi", () => {
    expect(xatoYorligi("AUDIO_WORT", "bu hech qachon kelmasligi kerak bo'lgan matn")).toBe(
      "Eshitish savoli",
    );
  });
});

describe("xatoYorligi — rasmli formatlar", () => {
  it("eshitib rasm tanlash — eshitish savoli", () => {
    expect(xatoYorligi("AUDIO_BILD", "")).toBe("Eshitish savoli");
  });

  it("rasmga qarab yozish — rasm savoli", () => {
    expect(xatoYorligi("BILD_TIPPEN", "")).toBe("Rasm savoli");
  });

  it("so'zga rasm tanlashda savol so'zning o'zi", () => {
    expect(xatoYorligi("BILD_WORT", "der Bahnhof")).toBe("der Bahnhof");
  });
});

describe("xatoYorligi — soat formatlari", () => {
  it("vaqtni eshitib soat tanlash — eshitish savoli", () => {
    expect(xatoYorligi("UHR_HOEREN", "")).toBe("Eshitish savoli");
  });

  it("soatni o'qish va yozish — soat savoli", () => {
    expect(xatoYorligi("UHR_LESEN", "")).toBe("Soat savoli");
    expect(xatoYorligi("UHR_TIPPEN", "")).toBe("Soat savoli");
  });

  it("an answered clock question shows the German words, not the HH:MM", () => {
    expect(
      javobPaneliMatni({ isCorrect: false, richtig: "03:30", loesungWort: "halb vier" }).soz,
    ).toBe("halb vier");
  });
});

describe("natijaQatorlari", () => {
  const base = {
    punkte: 50,
    serie: 4,
    serieYangi: true,
    orin: { gruppe: { oldin: 3, hozir: 1 }, zentrum: { oldin: 9, hozir: 7 } },
  };

  it("no answer from the server draws nothing", () => {
    expect(natijaQatorlari(null)).toEqual({ ball: null, serie: null, orin: null });
  });

  it("points, the streak on the first practice of the day, the group rank", () => {
    expect(natijaQatorlari(base)).toEqual({
      ball: 50,
      serie: 4,
      orin: "Guruhda 1-o'rin — 2 pog'ona ko'tarildingiz",
    });
  });

  it("0 points and a later session show neither line", () => {
    const r = natijaQatorlari({ ...base, punkte: 0, serieYangi: false });
    expect(r.ball).toBeNull();
    expect(r.serie).toBeNull();
  });

  it("an unchanged rank is not repeated", () => {
    const r = natijaQatorlari({ ...base, orin: { gruppe: { oldin: 2, hozir: 2 }, zentrum: { oldin: 5, hozir: 5 } } });
    expect(r.orin).toBeNull();
  });

  it("no group: the centre rank speaks", () => {
    const r = natijaQatorlari({ ...base, orin: { gruppe: null, zentrum: { oldin: 9, hozir: 12 } } });
    expect(r.orin).toBe("Markazda 12-o'rin — 3 pog'ona tushdingiz");
  });
});
