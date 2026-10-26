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

describe("the amber ink of the «Deyarli!» heading", () => {
  // Bright amber on its own wash is under 3:1, so the heading has an ink of its
  // own: dark brown in light mode, the pale amber in dark mode. It is a plain
  // custom property, not a Tailwind colour name, so the global @theme is left
  // alone.
  const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");
  const block = (selector: string) =>
    css.match(new RegExp(`^${selector} \\{([\\s\\S]*?)^\\}`, "m"))?.[1] ?? "";

  it("is defined in both the .lumio and the .dark .lumio blocks", () => {
    expect(block("\\.lumio")).toMatch(/--amber-ink:\s*#[0-9a-f]{6};/i);
    expect(block("\\.dark \\.lumio")).toMatch(/--amber-ink:\s*#[0-9a-f]{6};/i);
  });

  it("is not a name in the global @theme", () => {
    expect(css).not.toContain("--color-amber-ink");
  });
});

describe("the device's «Kam harakat» switch", () => {
  // `useKamHarakat` marks a screen root with `data-kam-harakat`; until now only
  // the pulse ring listened to it, so the result screen's fade and the unit
  // page's stagger still moved for a student who had asked for less motion.
  it("resolves the entrance fades, the stagger and the shake at once, like the system setting", () => {
    const css = readFileSync(path.join(__dirname, "globals.css"), "utf8").replace(/\s+/g, " ");
    expect(css).toContain(
      ".lumio [data-kam-harakat] .lumio-fade-up, .lumio [data-kam-harakat] .lumio-stagger > *, .lumio [data-kam-harakat] .lumio-shake { animation-duration: 0.001ms; animation-delay: 0ms; }",
    );
  });
});

describe("the «O'rmon» scene's motion (ADR-0131)", () => {
  const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");
  const flat = css.replace(/\s+/g, " ");
  const list = ":is(.ormon-spark, .ormon-leaf, .ormon-rays, .ormon-mist, .ormon-ring, .ormon-burst, .ormon-bob)";

  it("animates only transform and opacity", () => {
    const frames = [...css.matchAll(/@keyframes (ormon-[\w-]+) \{([\s\S]*?)\n\}/g)];
    expect(frames.map((m) => m[1])).toEqual([
      "ormon-drift",
      "ormon-blink",
      "ormon-fall",
      "ormon-rays",
      "ormon-mist",
      "ormon-ring",
      "ormon-bob",
      "ormon-spin",
    ]);
    for (const [, name, body] of frames) {
      const props = new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]));
      expect([...props].filter((p) => p !== "transform" && p !== "opacity"), name).toEqual([]);
    }
  });

  it("holds the drifting decor still while the scene is paused", () => {
    expect(flat).toContain(
      ".lumio [data-tinch] :is(.ormon-spark, .ormon-leaf, .ormon-rays, .ormon-mist) { animation-play-state: paused; }",
    );
  });

  it("holds everything animated inside a hidden biome stack still, so it runs no timeline unseen", () => {
    expect(flat).toContain(`.lumio .ormon-biome:not([data-faol]) ${list} { animation-play-state: paused; }`);
  });

  it("stops every animation and the biome fade under the device's «Kam harakat» switch", () => {
    expect(flat).toContain(
      `.lumio [data-kam-harakat] ${list}, .lumio [data-kam-harakat] .ormon-biome { animation: none; transition: none; }`,
    );
  });

  it("does the same under the system setting, also for the visible biome", () => {
    expect(flat).toContain(
      `@media (prefers-reduced-motion: reduce) { .lumio ${list}, .lumio .ormon-biome, .lumio .ormon-biome[data-faol] { animation: none; transition: none; }`,
    );
  });

  // The layers do not move without the parallax, so a compositor layer each is
  // memory spent on nothing. The reset must be at least as specific as, and
  // after, the visible biome's `will-change: transform`.
  it("takes the layers' compositor hint back where there is no parallax: «Kam harakat» and the system setting", () => {
    const base = ".lumio .ormon-biome[data-faol] .ormon-layer { will-change: transform; }";
    const kamReset = ".lumio [data-kam-harakat] .ormon-biome[data-faol] .ormon-layer { will-change: auto; }";
    const mediaReset = ".lumio .ormon-biome[data-faol] .ormon-layer { will-change: auto; } }";
    const mediaAt = flat.indexOf(`@media (prefers-reduced-motion: reduce) { .lumio ${list}`);
    expect(flat).toContain(base);
    expect(flat).toContain(kamReset);
    expect(mediaAt).toBeGreaterThan(-1);
    expect(flat.slice(mediaAt)).toContain(mediaReset);
    expect(flat.indexOf(base)).toBeLessThan(flat.indexOf(kamReset));
    expect(flat.indexOf(base)).toBeLessThan(mediaAt);
  });
});
