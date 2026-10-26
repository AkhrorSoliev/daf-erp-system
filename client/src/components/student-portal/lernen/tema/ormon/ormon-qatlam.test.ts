import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BIOME_IDS, BIOMES, type BiomeId } from "./ormon-biom";
import { OrmonQatlam, tileShapes } from "./ormon-qatlam";
import { scenePlan, TILE, type LayerId } from "./ormon-sahna-rejasi";
import type { Shape } from "./ormon-shakllar";

const draw = (layer: LayerId, count: number, biome: BiomeId = "tong") =>
  renderToStaticMarkup(createElement(OrmonQatlam, { biome, layer, count }));
const tags = (html: string) => (html.match(/<[a-zA-Z]/g) ?? []).length;

describe("<OrmonQatlam />", () => {
  it("tells the parallax its factor and repeats one tile four times with <use>", () => {
    const html = draw("mid", 8);
    expect(html).toContain('data-omil="0.5"');
    // The tile itself plus three copies: the offset wraps in (-640, 0], so
    // four tiles cover a viewport up to 1920 px tall.
    expect(html.match(/<use /g)).toHaveLength(3);
    for (const y of [640, 1280, 1920]) expect(html).toContain(`y="${y}"`);
    expect(html).toContain('href="#ormon-tong-mid-tile"');
    expect(html).toContain("height:calc(100% + 640px)");
  });

  it("blurs inside the SVG, never with a CSS filter on the moving layer", () => {
    const html = draw("far", 2);
    expect(html).toContain('<feGaussianBlur stdDeviation="5"');
    expect(html).not.toMatch(/style="[^"]*filter/);
  });

  it("paints in its biome's colour for its depth", () => {
    expect(draw("near", 3, "kuz")).toContain(`fill="${BIOMES.kuz.near}"`);
    expect(draw("mid", 8, "kol")).toContain(`fill="${BIOMES.kol.mid}"`);
  });

  it("is a few dozen elements, whatever the path's length", () => {
    expect(tags(draw("far", 2))).toBeLessThan(40);
    expect(tags(draw("mid", 8))).toBeLessThan(70);
    expect(tags(draw("near", 3))).toBeLessThan(40);
  });

  it("gives each biome and depth its own ids, so three biomes can stand on one page", () => {
    expect(draw("mid", 8, "kol")).toContain('id="ormon-kol-mid-blur"');
    expect(draw("mid", 8, "tong")).not.toEqual(draw("mid", 8, "kol"));
  });
});

// The layer draws the tile again every TILE px, and its first copy has no copy
// above it. A shape reaching below the tile is therefore in every copy's top
// but the first one's, and the scene pops where the offset wraps. The shapes
// are what the component draws (`tileShapes`: the real seeds and counts).
describe("the tile's seam", () => {
  /** The lowest y a shape paints: a hill's and a bush's lower edge, a tree's trunk foot (its crowns rise above it). */
  const bottom = (s: Shape) => (s.kind === "hill" ? s.cy + s.ry : s.kind === "tree" ? s.y : s.cy + s.r);

  it("has nothing reach below y = TILE, in every biome and layer, full and light", () => {
    const below: string[] = [];
    let seen = 0;
    for (const light of [false, true]) {
      for (const { id, count } of scenePlan({ reduced: false, light }).layers) {
        for (const biome of BIOME_IDS) {
          for (const s of tileShapes(biome, id, count)) {
            seen++;
            if (bottom(s) > TILE) below.push(`${light ? "light" : "full"} ${biome} ${id}: a ${s.kind} reaches y = ${bottom(s)}`);
          }
        }
      }
    }
    expect(seen, "no shape was checked").toBeGreaterThan(0);
    expect(below).toEqual([]);
  });
});
