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
