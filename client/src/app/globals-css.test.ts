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

describe("the «O'rmon» scene's motion (ADR-0132)", () => {
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

// Nothing that floats over a scene may blur what is behind it: the scene's
// ambient layers animate all the time, so the blur would be recomputed every
// frame. The bottom-nav pill and the radio dock are `.glass`; the rule below
// takes the blur off while a scene's root (`data-sahna`) is on the page.
describe("the glass chrome over a theme's scene (ADR-0132)", () => {
  const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");
  const flat = css.replace(/\s+/g, " ");
  const portal = path.join(__dirname, "../components/student-portal");

  it("drops the backdrop blur only while a scene stands, after the rule that sets it", () => {
    const base = ".lumio .glass { backdrop-filter: var(--blur-glass); -webkit-backdrop-filter: var(--blur-glass); }";
    // The prefixed declaration first: Lightning CSS drops an unprefixed one that comes before an identical prefixed one.
    const off = ".lumio:has([data-sahna]) .glass { -webkit-backdrop-filter: none; backdrop-filter: none; }";
    expect(flat).toContain(base);
    expect(flat).toContain(off);
    expect(flat.indexOf(base)).toBeLessThan(flat.indexOf(off));
  });

  it("matches the attribute the scene's root carries and the chrome that floats over it", () => {
    expect(readFileSync(path.join(portal, "lernen/tema/ormon/ormon-sahna.tsx"), "utf8")).toContain('data-sahna="ormon"');
    for (const file of ["lumio/bottom-nav.tsx", "radio/radio-mini-player.tsx"]) {
      expect(readFileSync(path.join(portal, file), "utf8"), file).toMatch(/className="glass /);
    }
  });
});

// ---------------------------------------------------------------------------
// The «O'rmon» rules as a whole (ADR-0132). The pins above hold one rule each;
// this scan holds the rules nobody has written yet. Every slip it looks for
// fails SILENTLY in the browser: an unscoped rule styles every other portal,
// a comment inside a block makes Next's Lightning CSS drop the whole `@layer`,
// a filter on a scene that moves all the time is recomputed every frame, and a
// stray `will-change` costs a compositor layer for nothing.
// ---------------------------------------------------------------------------

interface CssRule {
  /** The at-rules around it, outermost first: `@media (…)`, `@keyframes ormon-drift`. */
  context: string[];
  selector: string;
  /** The text between its braces, comments kept. */
  body: string;
}

const withoutComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Every rule that has no block inside it (a keyframe step counts), in file order.
 * A brace inside a comment or a string is not a brace. Comments stay in `body`,
 * because that is what the scan looks for.
 */
function leafRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  const open: { prelude: string; nested: boolean }[] = [];
  let text = "";
  const token = /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{}]|[^{}"'/]+|\//g;
  for (const [tok] of css.matchAll(token)) {
    if (tok === "{") {
      // `@import "x";` and the like end in `;` and belong to no block.
      const prelude = (withoutComments(text).split(";").pop() ?? "").replace(/\s+/g, " ").trim();
      const parent = open.at(-1);
      if (parent) parent.nested = true;
      open.push({ prelude, nested: false });
      text = "";
    } else if (tok === "}") {
      const block = open.pop();
      if (!block) throw new Error("globals.css: a } with no {");
      if (!block.nested) rules.push({ context: open.map((o) => o.prelude), selector: block.prelude, body: text });
      text = "";
    } else {
      text += tok;
    }
  }
  if (open.length) throw new Error("globals.css: a { that is never closed");
  return rules;
}

const inOrmonKeyframes = (r: CssRule) => r.context.some((c) => c.startsWith("@keyframes ormon-"));

/** The rules that are the «O'rmon» theme's: a selector naming an `.ormon-*` class, and the steps of an `@keyframes ormon-*`. */
const ormonRules = (css: string) => leafRules(css).filter((r) => /\.ormon-/.test(r.selector) || inOrmonKeyframes(r));

/** The comma-separated parts of a selector list, leaving the commas inside `:is( … )` alone. */
const selectorParts = (selector: string) => selector.split(/,(?![^(]*\))/).map((s) => s.trim());

const LAYER_SHOWN = ".lumio .ormon-biome[data-faol] .ormon-layer";
const LAYER_SHOWN_NO_PARALLAX = ".lumio [data-kam-harakat] .ormon-biome[data-faol] .ormon-layer";

/** Each slip as `kind: where`. */
function ormonViolations(rules: CssRule[]): string[] {
  const out: string[] = [];
  for (const r of rules) {
    const where = [...r.context, r.selector].join(" > ");
    const reduced = r.context.some((c) => c.startsWith("@media") && c.includes("prefers-reduced-motion"));
    const body = withoutComments(r.body);
    if (!inOrmonKeyframes(r)) {
      for (const part of selectorParts(r.selector)) {
        if (!/^(?:\.dark )?\.lumio(?![\w-])/.test(part)) out.push(`scope: ${part}`);
      }
    }
    if (r.body.includes("/*")) out.push(`comment: ${where}`);
    if (/(?:^|[\s;])(?:-webkit-)?(?:backdrop-)?filter\s*:/.test(body)) out.push(`filter: ${where}`);
    for (const [, raw] of body.matchAll(/will-change\s*:\s*([^;]+)/g)) {
      const value = raw.trim();
      const allowed =
        (value === "transform" && r.selector === LAYER_SHOWN && !reduced) ||
        (value === "auto" && r.selector === LAYER_SHOWN_NO_PARALLAX && !reduced) ||
        (value === "auto" && r.selector === LAYER_SHOWN && reduced);
      if (!allowed) out.push(`will-change: ${where} (${value})`);
    }
  }
  return out;
}

describe("every «O'rmon» rule in globals.css (ADR-0132)", () => {
  it("is scoped to .lumio, has no comment inside its block, no filter, and a will-change only where the layers move", () => {
    const rules = ormonRules(readFileSync(path.join(__dirname, "globals.css"), "utf8"));
    // A scan that sees nothing would pass on any stylesheet.
    expect(rules.length, "no .ormon-* rule found: the scan is blind").toBeGreaterThan(0);
    expect(rules.some(inOrmonKeyframes), "no @keyframes ormon-* found: the scan is blind").toBe(true);
    expect(ormonViolations(rules)).toEqual([]);
  });

  it("does catch each kind of slip in a stylesheet that has them", () => {
    const bad = `
      /* above a rule is fine */
      .ormon-a { opacity: 1; }
      .lumio .ormon-b { color: red; /* inside is not */ }
      .lumio .ormon-c, .other { filter: blur(2px); }
      .lumio .ormon-d { -webkit-backdrop-filter: blur(4px); will-change: opacity; }
      @keyframes ormon-e { to { filter: blur(1px); } }
      .lumio .ormon-ok { transform: none; }
      @media (prefers-reduced-motion: reduce) {
        .lumio .ormon-biome[data-faol] .ormon-layer { will-change: transform; }
      }
    `;
    const kinds = ormonViolations(ormonRules(bad)).map((v) => v.split(":")[0]);
    expect(kinds.sort()).toEqual(["comment", "filter", "filter", "filter", "scope", "scope", "will-change", "will-change"]);
  });
});

// A shadcn overlay (sheet, dialog, alert dialog) is portaled into <body>, outside
// `.lumio`, so the `.glass` rule cannot reach it. On the path an overlay opens on
// every lesson-node tap and on the goal card while the scene keeps animating
// behind it, so its `backdrop-blur-xs` would be recomputed every frame.
describe("the backdrop blur over a scene reaches the portaled overlays too (ADR-0132)", () => {
  const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");
  const slots = ["sheet-overlay", "dialog-overlay", "alert-dialog-overlay"];
  const overlays = `body:has(.lumio [data-sahna]) :is(${slots.map((s) => `[data-slot="${s}"]`).join(", ")})`;
  const noBlur = "-webkit-backdrop-filter: none; backdrop-filter: none;";
  const flat = (s: string) => s.replace(/\s+/g, " ").trim();

  it("takes the blur off the three overlays while a scene stands, in a rule outside every @layer", () => {
    const rule = leafRules(css).find((r) => r.selector === overlays);
    expect(rule, "the overlay rule is missing").toBeDefined();
    // Unlayered declarations beat the Tailwind utility, which is in a layer.
    expect(rule?.context).toEqual([]);
    expect(flat(withoutComments(rule?.body ?? ""))).toBe(noBlur);
  });

  it("is written for the slots and the blur utility the overlays really carry", () => {
    for (const [file, slot] of [
      ["sheet.tsx", "sheet-overlay"],
      ["dialog.tsx", "dialog-overlay"],
      ["alert-dialog.tsx", "alert-dialog-overlay"],
    ]) {
      const source = readFileSync(path.join(__dirname, "../components/ui", file), "utf8");
      expect(source, file).toContain(`data-slot="${slot}"`);
      expect(source, file).toContain("supports-backdrop-filter:backdrop-blur");
    }
  });

  // The two rules below are the only ones that take a blur off under a scene.
  // Both write the prefixed declaration FIRST: Lightning CSS drops an unprefixed
  // declaration that precedes an identical prefixed one, and the built chunk
  // would carry the prefixed one alone.
  it("has exactly these two scene-conditioned rules, each with the prefixed declaration first", () => {
    const rules = leafRules(css).filter((r) => r.selector.includes("data-sahna"));
    expect(rules.map((r) => r.selector)).toEqual([".lumio:has([data-sahna]) .glass", overlays]);
    for (const r of rules) expect(flat(withoutComments(r.body)), r.selector).toBe(noBlur);
  });
});
