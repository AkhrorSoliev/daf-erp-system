import { describe, expect, it } from "vitest";
import { harakat, koersatma } from "./koersatma";
import type { FrageFormat } from "../types";

const HAMMASI: FrageFormat[] = [
  "WORT_UZ", "UZ_WORT", "PAAR", "ARTIKEL",
  "LUECKE", "SATZ_BAUEN", "SATZ_UEBERSETZEN", "REAKTION",
  "ZUORDNEN", "DIALOG_LUECKE",
  "AUDIO_WORT", "WORT_TIPPEN", "HOEREN_WAHL",
  "BILD_WORT", "AUDIO_BILD", "BILD_TIPPEN",
];

describe("koersatma", () => {
  it("har bir formatga matn beradi", () => {
    for (const f of HAMMASI) {
      expect(koersatma(f).length).toBeGreaterThan(0);
    }
  });

  it("formatlarni farqlaydi", () => {
    expect(koersatma("WORT_UZ")).not.toBe(koersatma("UZ_WORT"));
    expect(koersatma("ARTIKEL")).not.toBe(koersatma("LUECKE"));
  });
});

describe("harakat", () => {
  it("har bir format to'rttadan biriga tushadi", () => {
    for (const f of HAMMASI) {
      expect(["TANLASH", "YOZISH", "YIGISH", "RASM"]).toContain(harakat(f));
    }
  });

  it("PAAR — YIGISH", () => {
    expect(harakat("PAAR")).toBe("YIGISH");
  });

  it("SATZ_BAUEN — YIGISH", () => {
    expect(harakat("SATZ_BAUEN")).toBe("YIGISH");
  });

  it("LUECKE — YOZISH", () => {
    expect(harakat("LUECKE")).toBe("YOZISH");
  });

  it("WORT_UZ, UZ_WORT, ARTIKEL, SATZ_UEBERSETZEN, REAKTION — TANLASH", () => {
    expect(harakat("WORT_UZ")).toBe("TANLASH");
    expect(harakat("UZ_WORT")).toBe("TANLASH");
    expect(harakat("ARTIKEL")).toBe("TANLASH");
    expect(harakat("SATZ_UEBERSETZEN")).toBe("TANLASH");
    expect(harakat("REAKTION")).toBe("TANLASH");
  });
});

describe("yangi formatlar", () => {
  it("ikkalasiga ham ko'rsatma bor", () => {
    expect(koersatma("ZUORDNEN").length).toBeGreaterThan(0);
    expect(koersatma("DIALOG_LUECKE").length).toBeGreaterThan(0);
  });

  it("ZUORDNEN — yig'ish, DIALOG_LUECKE — tanlash", () => {
    // ZUORDNEN juftlaydi (PAAR kabi), DIALOG_LUECKE variant tanlaydi.
    expect(harakat("ZUORDNEN")).toBe("YIGISH");
    expect(harakat("DIALOG_LUECKE")).toBe("TANLASH");
  });
});

describe("audio formatlar", () => {
  it("AUDIO_WORT variant tanlash bilan ko'rsatiladi", () => {
    expect(harakat("AUDIO_WORT")).toBe("TANLASH");
  });

  it("WORT_TIPPEN yozish bilan ko'rsatiladi", () => {
    // Eshitib YOZISH — variant berilmaydi, aks holda mashq
    // eshitishni emas, tanishni tekshirardi.
    expect(harakat("WORT_TIPPEN")).toBe("YOZISH");
  });

  it("ikkalasining ko'rsatmasi bor va bo'sh emas", () => {
    // `MATN` — `Record<FrageFormat, string>`, ya'ni yangi format
    // qo'shilganda TypeScript yozuvni majburlaydi. Bu test bo'sh
    // satr bilan «to'ldirib qo'yish» yo'lini yopadi.
    expect(koersatma("AUDIO_WORT").length).toBeGreaterThan(0);
    expect(koersatma("WORT_TIPPEN").length).toBeGreaterThan(0);
  });

  it("HOEREN_WAHL — TANLASH", () => {
    expect(harakat("HOEREN_WAHL")).toBe("TANLASH");
  });
});

describe("rasmli formatlar", () => {
  it("har birining o'z ko'rsatmasi bor", () => {
    expect(koersatma("BILD_WORT")).toBe("Mos rasmni tanlang");
    expect(koersatma("AUDIO_BILD")).toBe("Eshiting va mos rasmni tanlang");
    expect(koersatma("BILD_TIPPEN")).toBe("Rasmda nima? Artikli bilan yozing");
  });

  it("rasm tanlash — RASM, rasmga qarab yozish — YOZISH", () => {
    expect(harakat("BILD_WORT")).toBe("RASM");
    expect(harakat("AUDIO_BILD")).toBe("RASM");
    expect(harakat("BILD_TIPPEN")).toBe("YOZISH");
  });
});
