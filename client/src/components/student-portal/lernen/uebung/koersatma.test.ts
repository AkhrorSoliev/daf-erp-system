import { describe, expect, it } from "vitest";
import { harakat, koersatma } from "./koersatma";
import type { FrageFormat } from "../types";

const HAMMASI: FrageFormat[] = [
  "WORT_UZ", "UZ_WORT", "PAAR", "ARTIKEL",
  "LUECKE", "SATZ_BAUEN", "SATZ_UEBERSETZEN", "REAKTION",
  "ZUORDNEN", "DIALOG_LUECKE",
];

describe("koersatma", () => {
  it("har o'nta formatga matn beradi", () => {
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
  it("har o'nta format uchtadan biriga tushadi", () => {
    for (const f of HAMMASI) {
      expect(["TANLASH", "YOZISH", "YIGISH"]).toContain(harakat(f));
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
