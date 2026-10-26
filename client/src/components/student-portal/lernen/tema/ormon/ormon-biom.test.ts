import { describe, expect, it } from "vitest";
import { BIOME_IDS, BIOMES, biomeForUnit } from "./ormon-biom";

describe("biomeForUnit (spec §5 palitraUnitga)", () => {
  it("walks dawn, lake and autumn by the unit's order in its level, and starts over", () => {
    expect([1, 2, 3, 4, 5, 6, 12].map(biomeForUnit)).toEqual(["tong", "kol", "kuz", "tong", "kol", "kuz", "kuz"]);
  });

  // An order the data should never hold still gets one exact biome: the walk
  // continues backwards below 1, a fraction is cut, and a number that is not a
  // number is the first unit.
  it("gives an exact biome for an order it does not expect", () => {
    expect(biomeForUnit(0)).toBe("kuz");
    expect(biomeForUnit(-1)).toBe("kol");
    expect(biomeForUnit(-5)).toBe("tong");
    expect(biomeForUnit(1.7)).toBe("tong");
    expect(biomeForUnit(Number.NaN)).toBe("tong");
    expect(biomeForUnit(Number.POSITIVE_INFINITY)).toBe("tong");
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
