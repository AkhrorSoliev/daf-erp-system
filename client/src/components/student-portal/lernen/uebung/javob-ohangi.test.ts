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
];

describe("the soft miss", () => {
  it("is amber, never the danger red", () => {
    for (const sinf of [XATO_SINFI, XATO_FONI, XATO_CHEGARASI, XATO_BELGISI, XATO_SARLAVHASI]) {
      expect(sinf).toContain("amber");
      expect(sinf).not.toContain("danger");
    }
  });

  it.each(JAVOB_FAYLLARI)("%s paints no answer red", (fayl) => {
    const manba = readFileSync(path.join(__dirname, fayl), "utf8");
    expect(manba).not.toMatch(/\b(?:bg|text|border)-danger\b/);
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
