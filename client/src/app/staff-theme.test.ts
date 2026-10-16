import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");

/** `oklch(L C H)` custom properties of the rule whose selector is exactly `selector`. */
function tokens(selector: string): Record<string, [number, number, number]> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = css.match(new RegExp(`^${escaped} \\{([^}]*)\\}`, "m"));
  if (!rule) throw new Error(`globals.css has no "${selector}" rule`);
  return Object.fromEntries(
    [...rule[1].matchAll(/(--[a-z-]+):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\);/g)].map((m) => [
      m[1],
      [Number(m[2]), Number(m[3]), Number(m[4])],
    ]),
  );
}

/** Relative luminance (WCAG) of an OKLCH colour, through linear sRGB. */
function luminance([l, c, h]: [number, number, number]): number {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const r = clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_);
  const g = clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_);
  const bl = clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("staff theme (admin and teacher portals)", () => {
  const light = tokens(":root");
  const themes = { light, dark: { ...light, ...tokens(".dark") } };

  // WCAG AA: 4.5:1 for text. Status colours are written as text on the page
  // and on the card (a debt figure, a profit figure), so they are held to it.
  it.each(Object.entries(themes))("keeps text readable in the %s theme", (_, t) => {
    for (const surface of ["--background", "--card"]) {
      for (const text of [
        "--foreground",
        "--muted-foreground",
        "--destructive",
        "--success",
        "--info",
      ]) {
        expect(contrast(t[text], t[surface]), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(t["--primary-foreground"], t["--primary"]), "button label").toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["--sidebar-foreground"], t["--sidebar"]), "menu text").toBeGreaterThanOrEqual(4.5);
  });

  // `--warning` is a marker colour (an icon, a tinted count). As text it is
  // bold and short; 3:1 is the floor for that and for a non-text mark.
  it.each(Object.entries(themes))("keeps the warning mark visible in the %s theme", (_, t) => {
    expect(contrast(t["--warning"], t["--card"])).toBeGreaterThanOrEqual(3);
  });
});
