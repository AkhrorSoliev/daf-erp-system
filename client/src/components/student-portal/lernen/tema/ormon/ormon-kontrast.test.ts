import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cssHexToken, hexContrast, mixHex } from "@/test-support/hex-contrast";
import { ACCENT, BIOME_IDS, BIOMES, CARD_SURFACE_ALPHA, DARK_VEIL } from "./ormon-biom";
import { NISHON } from "./ormon-joy";
import { SHAR } from "./ormon-tugun";

// Read from the stylesheet, the palette and the components' own colour tables
// (`NISHON`, `SHAR`), so a token or a colour change that breaks the contrast
// fails here instead of on a student's phone.
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const MODES = [
  { name: "light", selector: ".lumio", scene: (c: string) => c },
  { name: "dark", selector: ".dark .lumio", scene: (c: string) => mixHex(DARK_VEIL.color, c, DARK_VEIL.alpha) },
] as const;
const sceneColours = BIOME_IDS.flatMap((id) => Object.values(BIOMES[id]));

/** A `var(--token)` colour as the mode's hex; a hex stays as it is. */
const hexOf = (value: string, selector: string) => {
  const token = /^var\(--([a-z0-9-]+)\)$/.exec(value)?.[1];
  return token ? cssHexToken(css, selector, token) : value;
};

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
  for (const mode of MODES) {
    it(`${mode.name}: the place card's corner badges hold`, () => {
      for (const [holat, { fon, rang }] of Object.entries(NISHON)) {
        expect(hexContrast(hexOf(rang, mode.selector), hexOf(fon, mode.selector)), `${mode.name}: ${holat}`).toBeGreaterThanOrEqual(ICON);
      }
    });

    it(`${mode.name}: the lock on the frosted-stone node holds over every scene colour`, () => {
      // `SHAR.locked.fon` is `color-mix(in srgb, var(--surface) NN%, transparent)`: the surface token and its share over the scene.
      const stone = /var\(--([a-z0-9-]+)\)\s+(\d+)%/.exec(SHAR.locked.fon);
      if (!stone) throw new Error(`SHAR.locked.fon is no longer a surface token at some %: ${SHAR.locked.fon}`);
      const surface = cssHexToken(css, mode.selector, stone[1]);
      const share = Number(stone[2]) / 100;
      const lock = hexOf(SHAR.locked.belgi, mode.selector);
      for (const c of sceneColours) {
        expect(hexContrast(lock, mixHex(surface, mode.scene(c), share)), `${mode.name}: the stone over ${c}`).toBeGreaterThanOrEqual(ICON);
      }
    });
  }

  it("the gold and the mint node orbs keep their glyph readable at every stop of the gradient", () => {
    for (const holat of ["done", "active"] as const) {
      const { fon, belgi } = SHAR[holat];
      const stops = fon.match(/#[0-9a-f]{6}/gi) ?? [];
      expect(stops.length, `${holat}: no gradient stops found in ${fon}`).toBeGreaterThanOrEqual(2);
      for (const stop of stops) expect(hexContrast(belgi, stop), `${holat}: ${belgi} on ${stop}`).toBeGreaterThanOrEqual(ICON);
    }
  });
});
