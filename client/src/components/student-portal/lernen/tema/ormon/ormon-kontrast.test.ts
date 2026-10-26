import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cssHexToken, hexContrast, mixHex } from "@/test-support/hex-contrast";
import { ACCENT, BIOME_IDS, BIOMES, CARD_SURFACE_ALPHA, DARK_VEIL } from "./ormon-biom";
import { NISHON } from "./ormon-joy";

// Read from the stylesheet and the palette, so a token or a colour change that
// breaks the contrast fails here instead of on a student's phone.
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const MODES = [
  { name: "light", selector: ".lumio", scene: (c: string) => c },
  { name: "dark", selector: ".dark .lumio", scene: (c: string) => mixHex(DARK_VEIL.color, c, DARK_VEIL.alpha) },
] as const;
const sceneColours = BIOME_IDS.flatMap((id) => Object.values(BIOMES[id]));

// Text is held to 4.5:1 (spec §11); an icon is not text, its standard is 3:1.
const TEXT = 4.5;
const ICON = 3;

describe("the place card's text over the forest (spec §11: 4.5:1)", () => {
  for (const mode of MODES) {
    it(`${mode.name}: the name, the dark ink and the words-left caption hold over every scene colour`, () => {
      const surface = cssHexToken(css, mode.selector, "surface-card");
      for (const c of sceneColours) {
        const card = mixHex(surface, mode.scene(c), CARD_SURFACE_ALPHA);
        for (const token of ["ink-900", "ink-600", "amber-ink"]) {
          expect(
            hexContrast(cssHexToken(css, mode.selector, token), card),
            `${mode.name}: ${token} on the card over ${c}`,
          ).toBeGreaterThanOrEqual(TEXT);
        }
      }
    });
  }
});

describe("the path node's name (a plain surface pill, whatever is behind it)", () => {
  for (const mode of MODES) {
    it(`${mode.name}: the darkest ink holds on the surface`, () => {
      const ink = cssHexToken(css, mode.selector, "ink-900");
      expect(hexContrast(ink, cssHexToken(css, mode.selector, "surface-card"))).toBeGreaterThanOrEqual(TEXT);
    });
  }
});

describe("the forest's own coloured labels", () => {
  it("the unit banner's white text holds on every biome's deep green", () => {
    for (const id of BIOME_IDS) expect(hexContrast("#ffffff", BIOMES[id].near), id).toBeGreaterThanOrEqual(TEXT);
  });

  it("the «Boshlash» pill's white text holds on the accent", () => {
    expect(hexContrast("#ffffff", ACCENT)).toBeGreaterThanOrEqual(TEXT);
  });
});

describe("the state glyphs (icons, not text: 3:1)", () => {
  /** A `var(--token)` colour as the mode's hex; a hex stays as it is. */
  const hexOf = (value: string, selector: string) => {
    const token = /^var\(--([a-z0-9-]+)\)$/.exec(value)?.[1];
    return token ? cssHexToken(css, selector, token) : value;
  };

  for (const mode of MODES) {
    it(`${mode.name}: the place card's corner badges hold`, () => {
      for (const [holat, { fon, rang }] of Object.entries(NISHON)) {
        expect(hexContrast(hexOf(rang, mode.selector), hexOf(fon, mode.selector)), `${mode.name}: ${holat}`).toBeGreaterThanOrEqual(ICON);
      }
    });

    it(`${mode.name}: the lock on the frosted-stone node holds over every scene colour`, () => {
      // ormon-tugun.tsx `SHAR.locked.fon`: the surface at 72% over the scene, the lock in `--ink-600`.
      const surface = cssHexToken(css, mode.selector, "surface-card");
      const lock = cssHexToken(css, mode.selector, "ink-600");
      for (const c of sceneColours) {
        expect(hexContrast(lock, mixHex(surface, mode.scene(c), 0.72)), `${mode.name}: the stone over ${c}`).toBeGreaterThanOrEqual(ICON);
      }
    });
  }

  it("the gold and the mint node orbs keep their glyph readable at every stop of the gradient", () => {
    // ormon-tugun.tsx `SHAR.done / .active`: the glyph ink against the orb's gradient stops.
    const orbs = [
      { glyph: "#6b4a10", stops: ["#fff6d4", "#f2cd7a", "#e2ae52"] },
      { glyph: "#0d4a3d", stops: ["#f0fffb", "#86ead2", "#4fcdb3"] },
    ];
    for (const { glyph, stops } of orbs) {
      for (const stop of stops) expect(hexContrast(glyph, stop), `${glyph} on ${stop}`).toBeGreaterThanOrEqual(ICON);
    }
  });
});
