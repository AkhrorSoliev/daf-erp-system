import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const colourNames = (css: string) => [...css.matchAll(/(--color-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);

describe("globals.css @theme", () => {
  // A Tailwind colour re-pointed in the global @theme changes on every portal.
  // Lumio's amber, teal and sky once were, at variables defined only under
  // `.lumio`, so on staff pages bg-amber-500 and the rest drew no colour at
  // all. Lumio replaces Tailwind's shades inside `.lumio` instead.
  it("leaves Tailwind's own colours alone", () => {
    const tailwindTheme = createRequire(import.meta.url).resolve("tailwindcss/theme.css");
    const tailwind = new Set(colourNames(readFileSync(tailwindTheme, "utf8")));
    const globals = readFileSync(path.join(__dirname, "globals.css"), "utf8");
    const theme = [...globals.matchAll(/^@theme[^{]*\{([^}]*)\}/gm)].map((m) => m[1]).join("\n");

    expect(colourNames(theme).length).toBeGreaterThan(0);
    expect(colourNames(theme).filter((name) => tailwind.has(name))).toEqual([]);
  });
});
