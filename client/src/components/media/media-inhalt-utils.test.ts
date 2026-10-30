import { describe, expect, it } from "vitest";
import { bolimNavbati, sectionInhaltBosh, wortMatni } from "./media-inhalt-utils";
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
    dialoge: [],
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

describe("bolimNavbati", () => {
  it("ekrandagi tartibda, faqat ovozi borlarni beradi", () => {
    const navbat = bolimNavbati({
      sectionCode: "u01-s1",
      sectionTitleUz: "S",
      unitCode: "u01",
      unitTitleUz: "U",
      woerter: [
        { id: 1, de: "Haus", uz: "uy", artikel: "das", anzeige: null, core: true, picturable: true, audioUrl: "/w1", imageUrl: null },
        { id: 2, de: "ja", uz: "ha", artikel: null, anzeige: null, core: true, picturable: false, audioUrl: null, imageUrl: null },
      ],
      saetze: [{ id: 3, de: "Ich bin da.", uz: "Men shu yerdaman.", audioUrl: "/s3" }],
      phrasen: [{ id: 4, de: "Hallo!", uz: "Salom!", audioUrl: "/p4" }],
      dialoge: [{ id: 5, code: "d1", titelDe: "Im Café", titelUz: "Kafeda", audioUrl: "/d5", fragen: [] }],
      dialogZeilen: [{ id: 6, dialogId: 5, order: 1, sprecher: "A", de: "Hallo", uz: "Salom", audioUrl: "/z6" }],
    });
    expect(navbat.map((e) => e.id)).toEqual(["w1", "s3", "p4", "d5", "z6"]);
    expect(navbat[0].nom).toBe("das Haus");
    expect(navbat[4].nom).toBe("A: Hallo");
  });
});
