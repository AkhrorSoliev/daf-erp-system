import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  XATO_BELGISI,
  XATO_CHEGARASI,
  XATO_FONI,
  XATO_SARLAVHASI,
  XATO_SINFI,
} from "./javob-ohangi";

// Spec §3, ADR-0128: a wrong answer is the soft «almost», never a red wall.
const JAVOB_FAYLLARI = [
  "tanlash.tsx",
  "rasm-tanlash.tsx",
  "uhr-tanlash.tsx",
  "yozish.tsx",
  "yigish.tsx",
  "javob-paneli.tsx",
  "natija-ekrani.tsx",
  "natija-sahna.tsx",
];

// Any colour utility on the danger token (`ring-danger`, `fill-danger` …) or a raw red/rose shade.
// The network-error line in `seans-ekrani.tsx` is the one deliberate red; that file is not scanned.
const QIZIL_SINF = /\b(?:bg|text|border|ring|fill|stroke|outline|shadow)-danger\b|-(?:red|rose)-\d+/;

describe("the red guard", () => {
  it("catches the ways a surface can be painted red", () => {
    for (const sinf of [
      "bg-danger",
      "text-danger",
      "border-danger/40",
      "ring-danger",
      "fill-danger",
      "stroke-danger",
      "outline-danger",
      "shadow-danger/20",
      "bg-red-500",
      "text-rose-600",
      "border-red-300",
    ]) {
      expect(QIZIL_SINF.test(`flex ${sinf} p-2`), sinf).toBe(true);
    }
  });
  it("lets the soft miss and the right-answer colours through", () => {
    for (const sinf of ["border-amber-500", "bg-amber-500/10", "text-artikel-das", "text-artikel-die", "border-success"]) {
      expect(QIZIL_SINF.test(`flex ${sinf} p-2`), sinf).toBe(false);
    }
  });
});

describe("the soft miss", () => {
  it("is amber, never the danger red", () => {
    for (const sinf of [XATO_SINFI, XATO_FONI, XATO_CHEGARASI, XATO_BELGISI, XATO_SARLAVHASI]) {
      expect(sinf).toContain("amber");
      expect(sinf).not.toContain("danger");
    }
  });

  it.each(JAVOB_FAYLLARI)("%s paints no answer red", (fayl) => {
    const manba = readFileSync(path.join(__dirname, fayl), "utf8");
    expect(manba).not.toMatch(QIZIL_SINF);
  });
});

// The mark beside a missed choice is a filled icon (20–28 px): amber-600 is 2.29:1 on white.
describe("the missed-choice mark", () => {
  it("takes amber-700 (3:1 for a graphic), not amber-600", () => {
    expect(XATO_BELGISI).toContain("amber-700");
    expect(XATO_BELGISI).not.toContain("amber-600");
  });
});

// A right answer's text sits on a wash of its own green: the bright success green
// is 2.3–2.6:1 there, the deep green of the article colours 4.7:1. The check icon on the
// picture and clock choices is a graphic on a white disc (2.6:1, needs 3:1) and takes it too.
describe("the right answer's text", () => {
  it.each(["tanlash.tsx", "yozish.tsx", "yigish.tsx", "rasm-tanlash.tsx", "uhr-tanlash.tsx"])(
    "%s draws it in the deep green",
    (fayl) => {
      const manba = readFileSync(path.join(__dirname, fayl), "utf8");
      expect(manba).toContain("text-artikel-das");
      expect(manba).not.toMatch(/\btext-success\b/);
    },
  );
});

// In dark mode `--artikel-das` is a LIGHT green (#5fd394): on a hard white disc it would be 1.6:1,
// worse than before. The disc is the card surface (white in light mode, the dark card at night),
// so both marks keep their contrast in both themes.
describe("the check and cross marks on the picture and clock choices", () => {
  it.each(["rasm-tanlash.tsx", "uhr-tanlash.tsx"])("%s puts both marks on the themed surface, not on white", (fayl) => {
    const manba = readFileSync(path.join(__dirname, fayl), "utf8");
    expect(manba.match(/absolute right-2 top-2 rounded-full bg-surface/g)).toHaveLength(2);
    expect(manba).not.toMatch(/absolute right-2 top-2 rounded-full bg-white/);
  });
});

// The verdict bar is tinted (`PastkiPanel`), and a bright amber or green word on
// a wash of itself is under 3:1. The 18 px heading and the small lead-in label
// need 4.5:1, so they take darker ink than the brand hues.
describe("the verdict text on the tinted bar", () => {
  const paneli = readFileSync(path.join(__dirname, "javob-paneli.tsx"), "utf8");

  it("draws the «Deyarli!» heading in the amber ink, not the bright amber", () => {
    expect(XATO_SARLAVHASI).toContain("--amber-ink");
    expect(XATO_SARLAVHASI).not.toContain("amber-700");
  });

  it("draws the right-answer heading in the deep green of the article colours", () => {
    expect(paneli).toContain("text-artikel-das");
    expect(paneli).not.toMatch(/\btext-success\b/);
  });

  it("draws the lead-in label darker than the secondary grey", () => {
    expect(paneli).toContain("text-ink-600");
    expect(paneli).not.toContain("text-ink-500");
  });
});

// The result screen's small text sits on white cards: the bright success green
// (#2bb673) is 2.61:1 there and the secondary grey (#6b8392) 3.97:1, both under 4.5:1.
describe("the result screen's text on its white cards", () => {
  const ekran = readFileSync(path.join(__dirname, "natija-ekrani.tsx"), "utf8");

  it("draws the daily-goal line in the deep green of the article colours", () => {
    expect(ekran).toContain("text-artikel-das");
    expect(ekran).not.toMatch(/\btext-success\b/);
  });

  it("draws the «Qaytarib ko'ring» header darker than the secondary grey", () => {
    expect(ekran).toContain("text-ink-600");
    expect(ekran).not.toContain("text-ink-500");
  });
});
