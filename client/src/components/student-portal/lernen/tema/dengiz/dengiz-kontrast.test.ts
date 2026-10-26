import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cssHexToken, hexContrast, mixHex } from "@/test-support/hex-contrast";
import { CARD_SURFACE_ALPHA } from "../sahna-umumiy";
import { NISHON } from "./dengiz-joy";
import { SHAR } from "./dengiz-tugun";
import { ACCENT, DARK_VEIL, DEPTH_CHIP_ALPHA, TUBE_STEM, ZONE_IDS, ZONES } from "./dengiz-zona";

// Read from the stylesheet, the palette and the components' own colour tables
// (`NISHON`, `SHAR`), so a token or a colour change that breaks the contrast
// fails here instead of on a student's phone.
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const MODES = [
  { name: "light", selector: ".lumio", scene: (c: string) => c },
  { name: "dark", selector: ".dark .lumio", scene: (c: string) => mixHex(DARK_VEIL.color, c, DARK_VEIL.alpha) },
] as const;

/** Every colour the scene paints: the water, ridges, walls, decor and fish of each zone, the tubes' stems, the white of bubbles and tips. */
const sceneColours = [
  ...ZONE_IDS.flatMap((id) => {
    const p = ZONES[id];
    return [p.top, p.mid, p.bottom, p.ridge, p.rock, ...p.decor, p.fish];
  }),
  TUBE_STEM,
  "#ffffff",
];

/** A `var(--token)` colour as the mode's hex; a hex stays as it is. */
const hexOf = (value: string, selector: string) => {
  const token = /^var\(--([a-z0-9-]+)\)$/.exec(value)?.[1];
  return token ? cssHexToken(css, selector, token) : value;
};

// Text is held to 4.5:1 (spec §11); an icon is not text, its standard is 3:1.
const TEXT = 4.5;
const ICON = 3;

describe("the place card's text over the sea (spec §11: 4.5:1)", () => {
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

describe("the sea's own coloured labels", () => {
  it("the unit banner's white text holds on every zone's banner, and on the darker depth chip", () => {
    for (const id of ZONE_IDS) {
      expect(hexContrast("#ffffff", ZONES[id].banner), id).toBeGreaterThanOrEqual(TEXT);
      expect(hexContrast("#ffffff", mixHex("#000000", ZONES[id].banner, DEPTH_CHIP_ALPHA)), `${id}: chip`).toBeGreaterThanOrEqual(TEXT);
    }
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
      // `SHAR.locked.fon` is `color-mix(in srgb, var(--surface-card) NN%, transparent)`: the surface token and its share over the scene.
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

  it("the pearl and the gold orbs keep their glyph readable at every stop of the gradient", () => {
    for (const holat of ["done", "active"] as const) {
      const { fon, belgi } = SHAR[holat];
      const stops = fon.match(/#[0-9a-f]{6}/gi) ?? [];
      expect(stops.length, `${holat}: no gradient stops found in ${fon}`).toBeGreaterThanOrEqual(2);
      for (const stop of stops) expect(hexContrast(belgi, stop), `${holat}: ${belgi} on ${stop}`).toBeGreaterThanOrEqual(ICON);
    }
  });
});

describe("the reward background (the result's ink-900 heading and ink-600 line, 4.5:1)", () => {
  for (const mode of MODES) {
    it(`${mode.name}: both hold on the water, its edge, the sand and under the rays`, () => {
      const esc = mode.selector.replace(/\./g, "\\.");
      const block = css.match(new RegExp(`^${esc} \\{([\\s\\S]*?)^\\}`, "m"))?.[1] ?? "";
      const nur = block.match(/--dengiz-mukofot-nur:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
      if (!nur) throw new Error(`--dengiz-mukofot-nur not found in ${mode.selector}`);
      const [r, g, b, a] = nur.slice(1).map(Number);
      const nurHex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      const ust = cssHexToken(css, mode.selector, "dengiz-mukofot-ust");
      const grounds = [
        ust,
        cssHexToken(css, mode.selector, "dengiz-mukofot-ost"),
        cssHexToken(css, mode.selector, "dengiz-tepalik"),
        mixHex(nurHex, ust, a),
      ];
      for (const ground of grounds) {
        for (const token of ["ink-900", "ink-600"]) {
          expect(
            hexContrast(cssHexToken(css, mode.selector, token), ground),
            `${mode.name}: ${token} on ${ground}`,
          ).toBeGreaterThanOrEqual(TEXT);
        }
      }
    });
  }
});
