import { describe, expect, it } from "vitest";
import { TILE } from "../sahna-umumiy";
import {
  ELEMENT_BUDGET,
  STRIP_WIDTH,
  WALL_FACTOR,
  WALL_STEP,
  bubbleSpecs,
  decorSpecs,
  dengizPlan,
  schoolSpecs,
  stripShapes,
  type Side,
  wallPath,
  wallPoints,
} from "./dengiz-reja";
import { ZONE_IDS, ZONES, zoneForUnit } from "./dengiz-zona";

describe("zoneForUnit (spec §5 palitraUnitga)", () => {
  it("dives reef, kelp and deep sea by the unit's order in its level, and starts over", () => {
    expect([1, 2, 3, 4, 5, 6, 12].map(zoneForUnit)).toEqual(["marjon", "kelp", "chuqur", "marjon", "kelp", "chuqur", "chuqur"]);
  });

  it("gives an exact zone for an order the data should never hold", () => {
    expect(zoneForUnit(0)).toBe("chuqur");
    expect(zoneForUnit(-1)).toBe("kelp");
    expect(zoneForUnit(1.7)).toBe("marjon");
    expect(zoneForUnit(Number.NaN)).toBe("marjon");
    expect(zoneForUnit(Number.POSITIVE_INFINITY)).toBe("marjon");
  });
});

describe("ZONES", () => {
  it("has the mockup's colours for every zone, each a #rrggbb", () => {
    for (const id of ZONE_IDS) {
      const { decor, ...rest } = ZONES[id];
      for (const c of [...Object.values(rest), ...decor]) expect(c, `${id}: ${c}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(Object.keys(ZONES[id]).sort()).toEqual(["banner", "bottom", "decor", "fish", "mid", "ridge", "rock", "top"]);
    }
  });
});

describe("dengizPlan", () => {
  it("draws the full dive: four decorations a strip, two fronds, eight bubbles, two schools, the walls following the scroll", () => {
    expect(dengizPlan({ reduced: false, light: false })).toEqual({ decor: 4, sways: 2, bubbles: 8, schools: 2, parallax: true });
  });

  it("draws about half on a weak device, and no fronds", () => {
    expect(dengizPlan({ reduced: false, light: true })).toEqual({ decor: 2, sways: 0, bubbles: 4, schools: 1, parallax: true });
  });

  it("is a still picture under «Kam harakat»: no parallax, no bubbles, no fish, the walls still drawn", () => {
    for (const light of [false, true]) {
      const plan = dengizPlan({ reduced: true, light });
      expect(plan.parallax).toBe(false);
      expect(plan.bubbles).toBe(0);
      expect(plan.schools).toBe(0);
      expect(plan.decor).toBeGreaterThan(0);
    }
  });

  it("moves its only layer slower than the scroll and keeps a fifth of the spec's element cap", () => {
    expect(WALL_FACTOR).toBeGreaterThan(0);
    expect(WALL_FACTOR).toBeLessThan(1);
    expect(ELEMENT_BUDGET).toBeLessThanOrEqual(1500 / 5);
  });
});

describe("the wall", () => {
  it("is the same wall for a seed, another one for another seed", () => {
    expect(wallPoints(11)).toEqual(wallPoints(11));
    expect(wallPoints(11)).not.toEqual(wallPoints(23));
  });

  it("sets its face every WALL_STEP px from the tile's top to its bottom, near the edge, and ends where it starts", () => {
    const wall = wallPoints(11);
    expect(wall.map((p) => p.y)).toEqual(Array.from({ length: TILE / WALL_STEP + 1 }, (_, i) => i * WALL_STEP));
    expect(wall.at(-1)?.x).toBe(wall[0].x);
    for (const p of wall) {
      expect(p.x).toBeGreaterThanOrEqual(28);
      expect(p.x).toBeLessThanOrEqual(64);
    }
  });

  it("is one closed path from the edge that ends at the tile's bottom", () => {
    const d = wallPath(wallPoints(11));
    expect(d.startsWith("M0 0L")).toBe(true);
    expect(d.endsWith(`L0 ${TILE}Z`)).toBe(true);
  });
});

describe("the wall's decor", () => {
  it("spreads the asked number over the ledges, in the zone's kinds and colours", () => {
    const decor = decorSpecs("marjon", wallPoints(11), 4, 11);
    expect(decor.map((d) => d.kind)).toEqual(["coral", "fan", "coral", "fan"]);
    expect(new Set(decor.map((d) => d.y)).size).toBe(4);
    for (const d of decor) expect(ZONES.marjon.decor).toContain(d.color);
    expect(decorSpecs("kelp", wallPoints(111), 2, 111).map((d) => d.kind)).toEqual(["kelp", "kelp"]);
  });

  it("draws nothing for zero and never more than the ledges", () => {
    expect(decorSpecs("chuqur", wallPoints(211), 0, 211)).toEqual([]);
    expect(decorSpecs("chuqur", wallPoints(211), 50, 211)).toHaveLength(TILE / WALL_STEP - 1);
  });

  it("stays inside the strip: the widest decoration reaches 22 px from its foot", () => {
    for (const d of decorSpecs("marjon", wallPoints(11), 4, 11)) {
      expect(d.x).toBeGreaterThan(0);
      expect(d.x + 22 * d.scale).toBeLessThanOrEqual(STRIP_WIDTH);
    }
  });
});

// The strip draws its tile again every TILE px and its first copy has no copy
// above it: a shape reaching below the tile would be in every copy's top but the
// first one's, and the walls would pop where the offset wraps. Every decoration
// grows UP from its foot, so the feet and the wall's last point are what count.
// The shapes are what the strip draws (`stripShapes`: the real seeds and counts).
describe("the tile's seam", () => {
  it("has the wall end exactly at y = TILE and every foot strictly inside the tile, in every zone and side, full and light", () => {
    const wrong: string[] = [];
    let seen = 0;
    for (const light of [false, true]) {
      const { decor: count } = dengizPlan({ reduced: false, light });
      for (const zona of ZONE_IDS) {
        for (const side of ["left", "right"] as Side[]) {
          const { wall, decor } = stripShapes(zona, side, count);
          seen += wall.length + decor.length;
          if (Math.max(...wall.map((p) => p.y)) !== TILE) wrong.push(`${zona} ${side}: the wall ends at ${wall.at(-1)?.y}`);
          for (const d of decor) if (d.y <= 0 || d.y >= TILE) wrong.push(`${zona} ${side}: a ${d.kind} stands at y = ${d.y}`);
        }
      }
    }
    expect(seen, "no shape was checked").toBeGreaterThan(0);
    expect(wrong).toEqual([]);
  });
});

describe("the water's life", () => {
  it("gives the asked number, the same every time; every other school swims left", () => {
    expect(bubbleSpecs(8)).toHaveLength(8);
    expect(bubbleSpecs(8)).toEqual(bubbleSpecs(8));
    expect(schoolSpecs(2)).toEqual(schoolSpecs(2));
    expect(schoolSpecs(2).map((s) => s.chap)).toEqual([false, true]);
  });

  it("keeps the bubbles on screen, small and slow, and the schools in the middle of the water", () => {
    for (const b of bubbleSpecs(8)) {
      expect(b.left).toBeGreaterThanOrEqual(6);
      expect(b.left).toBeLessThanOrEqual(94);
      expect(b.size).toBeGreaterThanOrEqual(4);
      expect(b.size).toBeLessThanOrEqual(12);
      expect(b.rise).toBeGreaterThanOrEqual(18);
    }
    for (const s of schoolSpecs(2)) {
      expect(s.top).toBeGreaterThanOrEqual(18);
      expect(s.top).toBeLessThanOrEqual(70);
      expect(s.swim).toBeGreaterThanOrEqual(40);
    }
  });
});
