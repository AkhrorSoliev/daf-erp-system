import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");

/** Custom properties declared by the rule whose selector is exactly `selector`. */
function tokens(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = css.match(new RegExp(`^${escaped} \\{([^}]*)\\}`, "m"));
  if (!rule) throw new Error(`globals.css has no "${selector}" rule`);
  return Object.fromEntries(
    [...rule[1].matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]),
  );
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("Daftar sign-in theme", () => {
  // `.daftar.daftar-lines` and `.dark .daftar` are equally specific, so source
  // order decides between them; the sheets below assume the dark block wins.
  it("keeps the ruled variant ahead of the dark block", () => {
    const lines = css.indexOf("\n.daftar.daftar-lines {");
    expect(lines).toBeGreaterThan(-1);
    expect(lines).toBeLessThan(css.indexOf("\n.dark .daftar {"));
  });

  // WCAG AA: 4.5:1 for text, 3:1 for the boundary of a control.
  it("is readable on all four sheets", () => {
    const light = tokens(".daftar");
    const lines = tokens(".daftar.daftar-lines");
    const dark = tokens(".dark .daftar");
    const darkLines = tokens(".dark .daftar.daftar-lines");
    const sheets = {
      "admin, light": { ...light },
      "teacher, light": { ...light, ...lines },
      "admin, dark": { ...light, ...dark },
      "teacher, dark": { ...light, ...lines, ...dark, ...darkLines },
    };

    for (const [name, t] of Object.entries(sheets)) {
      const paper = t["--background"];
      for (const text of ["--foreground", "--muted-foreground", "--primary", "--destructive"]) {
        expect(contrast(t[text], paper), `${name}: ${text}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(t["--primary-foreground"], t["--primary"]),
        `${name}: button label`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t["--input"], paper), `${name}: field underline`).toBeGreaterThanOrEqual(3);
    }
  });
});
