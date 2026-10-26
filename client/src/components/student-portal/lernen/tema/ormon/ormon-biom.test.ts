import { describe, expect, it } from "vitest";
import { BIOME_IDS, BIOMES, biomeForUnit } from "./ormon-biom";

describe("biomeForUnit (spec §5 palitraUnitga)", () => {
  it("walks dawn, lake and autumn by the unit's order in its level, and starts over", () => {
    expect([1, 2, 3, 4, 5, 6, 12].map(biomeForUnit)).toEqual(["tong", "kol", "kuz", "tong", "kol", "kuz", "kuz"]);
  });

  it("gives a biome for an order it does not expect, never undefined", () => {
    for (const n of [0, -1, -5, 1.7, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(BIOME_IDS).toContain(biomeForUnit(n));
    }
    expect(biomeForUnit(Number.NaN)).toBe("tong");
  });
});

describe("BIOMES", () => {
  it("has the mockup's six colours for every biome", () => {
    for (const id of BIOME_IDS) {
      for (const c of Object.values(BIOMES[id])) expect(c).toMatch(/^#[0-9a-f]{6}$/);
      expect(Object.keys(BIOMES[id]).sort()).toEqual(["far", "glow", "mid", "near", "sky1", "sky2"]);
    }
  });
});
