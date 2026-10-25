import { describe, expect, it } from "vitest";
import {
  eshitiladiganMatn,
  javobPaneliMatni,
  juftPaneliMatni,
  natijaQatorlari,
  orinXabari,
  xatoYorligi,
  yuborishXatoMatni,
} from "./natija-xabari";

// A marking `t`: every text it receives comes back in brackets, filled in.
const tr = (s: string, p?: Record<string, string | number>) =>
  `[${s.replace(/\{(\w+)\}/g, (_, k: string) => String(p?.[k]))}]`;

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

  it("a wrong answer is the soft «almost» and shows the right one", () => {
    expect(javobPaneliMatni({ isCorrect: false, richtig: "Bahnhof" })).toEqual({
      sarlavha: "Deyarli!",
      izoh: "To'g'ri javob:",
      soz: "Bahnhof",
    });
  });

  it("a wrong answer with no word to show says only «almost»", () => {
    expect(javobPaneliMatni({ isCorrect: false, richtig: "" })).toEqual({
      sarlavha: "Deyarli!",
      izoh: null,
      soz: "",
    });
  });

  it("a picture answer shows the word, never the picture URL", () => {
    const natija = { isCorrect: false, richtig: "https://x/b.jpg", loesungWort: "der Bahnhof" };
    expect(javobPaneliMatni(natija).soz).toBe("der Bahnhof");
    expect(javobPaneliMatni({ ...natija, isCorrect: true }).soz).toBe("der Bahnhof");
  });
});

// What the screen reader hears after a check (the visually-hidden live region of the session).
describe("eshitiladiganMatn", () => {
  const JUFT_QAYTADI =
    "Hammasi to'g'ri! Ammo bu savolda birinchi urinishda xato bo'lgani uchun u keyinroq yana qaytadi.";
  const bosh = { natija: null, juftlash: false, yuborishXato: false };

  it("a right answer is spoken as the panel shows it", () => {
    expect(eshitiladiganMatn({ ...bosh, natija: { isCorrect: true, richtig: "Bahnhof" } })).toBe("To'g'ri!");
  });

  it("a slip counts as correct and the right spelling is spoken too", () => {
    expect(
      eshitiladiganMatn({ ...bosh, natija: { isCorrect: true, richtig: "Bahnhof", tippfehler: true } }),
    ).toBe("To'g'ri! Imlosiga e'tibor bering: Bahnhof");
  });

  it("a wrong answer says «almost» and the right word", () => {
    expect(
      eshitiladiganMatn({ ...bosh, natija: { isCorrect: false, richtig: "https://x/b.jpg", loesungWort: "der Bahnhof" } }),
    ).toBe("Deyarli! To'g'ri javob: der Bahnhof");
  });

  it("a wrong answer with no word to show says only «almost»", () => {
    expect(eshitiladiganMatn({ ...bosh, natija: { isCorrect: false, richtig: "" } })).toBe("Deyarli!");
  });

  it("a finished pairing board with no slip says «correct»", () => {
    expect(
      eshitiladiganMatn({ ...bosh, juftlash: true, natija: { isCorrect: true, richtig: "a=b" } }),
    ).toBe("To'g'ri!");
  });

  it("a pairing board with a first-try slip says the question comes back, not «almost»", () => {
    const matn = eshitiladiganMatn({ ...bosh, juftlash: true, natija: { isCorrect: false, richtig: "a=b" } });
    expect(matn).toBe(JUFT_QAYTADI);
    expect(matn).not.toContain("Deyarli");
  });

  it("the panel and the live region share one pairing text", () => {
    expect(juftPaneliMatni(true)).toBe("To'g'ri!");
    expect(juftPaneliMatni(false)).toBe(JUFT_QAYTADI);
    expect(eshitiladiganMatn({ ...bosh, juftlash: true, natija: { isCorrect: false, richtig: "a=b" } })).toBe(
      juftPaneliMatni(false),
    );
  });

  it("a check whose request failed is spoken too, and is the panel's own line", () => {
    expect(eshitiladiganMatn({ ...bosh, yuborishXato: true })).toBe("Yuborib bo'lmadi. Qayta urinib ko'ring");
    expect(eshitiladiganMatn({ ...bosh, yuborishXato: true })).toBe(yuborishXatoMatni());
  });

  it("an answer wins over a failed earlier request", () => {
    expect(
      eshitiladiganMatn({ ...bosh, yuborishXato: true, natija: { isCorrect: true, richtig: "x" } }),
    ).toBe("To'g'ri!");
  });

  it("says nothing before a check", () => {
    expect(eshitiladiganMatn(bosh)).toBe("");
    expect(eshitiladiganMatn({ ...bosh, juftlash: true })).toBe("");
  });

  it("goes through the page's t, the server's word never does", () => {
    expect(eshitiladiganMatn({ ...bosh, natija: { isCorrect: false, richtig: "der Bahnhof" } }, tr)).toBe(
      "[Deyarli!] [To'g'ri javob:] der Bahnhof",
    );
    expect(eshitiladiganMatn({ ...bosh, yuborishXato: true }, tr)).toBe("[Yuborib bo'lmadi. Qayta urinib ko'ring]");
    expect(eshitiladiganMatn({ ...bosh, juftlash: true, natija: { isCorrect: false, richtig: "" } }, tr)).toBe(
      `[${JUFT_QAYTADI}]`,
    );
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
    expect(natijaQatorlari(null)).toEqual({
      ball: null,
      serie: null,
      orin: null,
      maqsad: null,
      nishonlar: [],
    });
  });

  it("points, the streak on the first practice of the day, the group rank", () => {
    expect(natijaQatorlari(base)).toEqual({
      ball: 50,
      serie: 4,
      orin: "Guruhda 1-o'rin — 2 pog'ona ko'tarildingiz",
      maqsad: null,
      nishonlar: [],
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

  it("maqsad faqat shu seansda bajarilganda", () => {
    const yangi = { ball: 80, hozir: 130, bajarildi: true, yangiBajarildi: true };
    expect(natijaQatorlari({ ...base, maqsad: yangi }).maqsad).toBe(
      "Kunlik maqsad bajarildi — 130 / 80",
    );
    expect(
      natijaQatorlari({ ...base, maqsad: { ...yangi, yangiBajarildi: false } }).maqsad,
    ).toBeNull();
    expect(
      natijaQatorlari({
        ...base,
        maqsad: { ball: 80, hozir: 30, bajarildi: false, yangiBajarildi: false },
      }).maqsad,
    ).toBeNull();
  });

  it("har yangi nishon — alohida qator", () => {
    expect(
      natijaQatorlari({ ...base, yangiNishonlar: ["SERIE_14", "WOERTER_50"] }).nishonlar,
    ).toEqual(["Yangi nishon: 14 kun ketma-ket", "Yangi nishon: 50 ta so'z"]);
  });
});

describe("the page's t", () => {
  it("translates the client's words, never the exercise data", () => {
    expect(javobPaneliMatni({ isCorrect: false, richtig: "der Bahnhof" }, tr)).toEqual({
      sarlavha: "[Deyarli!]",
      izoh: "[To'g'ri javob:]",
      soz: "der Bahnhof",
    });
    expect(
      javobPaneliMatni({ isCorrect: true, richtig: "Bahnhof", tippfehler: true }, tr),
    ).toEqual({ sarlavha: "[To'g'ri!]", izoh: "[Imlosiga e'tibor bering:]", soz: "Bahnhof" });
    expect(xatoYorligi("AUDIO_WORT", "", tr)).toBe("[Eshitish savoli]");
    expect(xatoYorligi("LUECKE", "Ich ___ Student.", tr)).toBe("Ich ___ Student.");
    expect(orinXabari(null, 4, "Markazda", tr)).toBe("[Markazda 4-o'rin]");
    expect(orinXabari(3, 5, "Guruhda", tr)).toBe("[Guruhda 5-o'rin — 2 pog'ona tushdingiz]");
    const r = natijaQatorlari(
      {
        punkte: 10,
        serie: 2,
        serieYangi: false,
        orin: { gruppe: null, zentrum: { oldin: 5, hozir: 3 } },
        maqsad: { ball: 80, hozir: 85, bajarildi: true, yangiBajarildi: true },
        yangiNishonlar: ["SERIE_7"],
      },
      tr,
    );
    expect(r.orin).toBe("[Markazda 3-o'rin — 2 pog'ona ko'tarildingiz]");
    expect(r.maqsad).toBe("[Kunlik maqsad bajarildi — 85 / 80]");
    expect(r.nishonlar).toEqual(["[Yangi nishon: [7 kun ketma-ket]]"]);
  });
});
