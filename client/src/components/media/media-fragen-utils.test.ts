import { describe, expect, it } from "vitest";
import { vorschauShakli } from "./media-fragen-utils";

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
