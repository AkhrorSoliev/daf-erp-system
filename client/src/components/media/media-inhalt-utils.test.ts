import { describe, expect, it } from "vitest";
import { sectionInhaltBosh, wortMatni } from "./media-inhalt-utils";
import type { SectionInhalt } from "./media-inhalt-types";

describe("wortMatni", () => {
  it("artikl so`z bilan birga ko`rsatiladi", () => {
    expect(wortMatni({ de: "Tisch", artikel: "der", anzeige: null })).toBe(
      "der Tisch",
    );
  });

  it("raqam so`z yonida ko`rsatiladi", () => {
    expect(wortMatni({ de: "sieben", artikel: null, anzeige: "7" })).toBe(
      "sieben (7)",
    );
  });

  it("artikl ham, raqam ham yo`q bo`lsa — so`zning o`zi", () => {
    expect(wortMatni({ de: "schnell", artikel: null, anzeige: null })).toBe(
      "schnell",
    );
  });
});

function boshInhalt(): SectionInhalt {
  return {
    sectionCode: "A1.1",
    sectionTitleUz: "Sinov bo'limi",
    unitCode: "U1",
    unitTitleUz: "Sinov uniti",
    woerter: [],
    saetze: [],
    phrasen: [],
    dialogZeilen: [],
  };
}

describe("sectionInhaltBosh", () => {
  it("to`rtta ro`yxat ham bo`sh bo`lsa — bo`lim bo`sh", () => {
    expect(sectionInhaltBosh(boshInhalt())).toBe(true);
  });

  it("faqat so`zlar bo`lsa ham — bo`lim bo`sh emas", () => {
    const inhalt = boshInhalt();
    inhalt.woerter = [
      {
        id: 1,
        de: "Tisch",
        uz: "stol",
        artikel: "der",
        anzeige: null,
        core: true,
        picturable: true,
        audioUrl: null,
        imageUrl: null,
      },
    ];
    expect(sectionInhaltBosh(inhalt)).toBe(false);
  });
});
