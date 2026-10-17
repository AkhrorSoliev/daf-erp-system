import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, cssTokens } from "@/test-support/oklch-contrast";

const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");
const tokens = (selector: string) => cssTokens(css, selector);

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
