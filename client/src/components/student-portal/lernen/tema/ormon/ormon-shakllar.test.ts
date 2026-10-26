import { describe, expect, it } from "vitest";
import { glowSpecs, layerShapes, leafSpecs, mistSpecs, seededRandom, sparkSpecs, type Bush, type Tree } from "./ormon-shakllar";

describe("seededRandom", () => {
  it("gives the same numbers for the same seed, so the server and the browser draw the same forest", () => {
    const a = seededRandom(5);
    const b = seededRandom(5);
    const xs = Array.from({ length: 20 }, () => a());
    expect(Array.from({ length: 20 }, () => b())).toEqual(xs);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("layerShapes", () => {
  it("is the same tile every time for a seed, another tile for another seed", () => {
    expect(layerShapes("mid", 8, 23)).toEqual(layerShapes("mid", 8, 23));
    expect(layerShapes("mid", 8, 23)).not.toEqual(layerShapes("mid", 8, 123));
  });

  it("far: a hill every 150 px down the tile and the asked number of big pale trees", () => {
    const shapes = layerShapes("far", 2, 11);
    expect(shapes.filter((s) => s.kind === "hill").map((s) => (s.kind === "hill" ? s.cy : 0))).toEqual([70, 220, 370, 520]);
    expect(shapes.filter((s) => s.kind === "tree")).toHaveLength(2);
  });

  it("mid: the asked number of trees across the width, the lower ones drawn last", () => {
    const trees = layerShapes("mid", 8, 23) as Tree[];
    expect(trees).toHaveLength(8);
    expect(trees.map((t) => t.y)).toEqual([...trees.map((t) => t.y)].sort((a, b) => a - b));
    for (const t of trees) {
      expect(t.x).toBeGreaterThanOrEqual(-3);
      expect(t.x).toBeLessThanOrEqual(103);
      expect(t.y).toBeLessThanOrEqual(640);
    }
  });

  it("near: three bushes per cluster on each edge, never in the middle of the path", () => {
    const bushes = layerShapes("near", 3, 37) as Bush[];
    expect(bushes).toHaveLength(18);
    expect(bushes.filter((b) => b.side === "left")).toHaveLength(9);
    for (const b of bushes) {
      expect(b.inset).toBeGreaterThanOrEqual(-32);
      expect(b.inset).toBeLessThanOrEqual(8);
    }
  });

  it("draws nothing for zero", () => {
    expect(layerShapes("mid", 0, 23)).toEqual([]);
    expect(layerShapes("near", 0, 37)).toEqual([]);
  });
});

describe("ambient specs", () => {
  it("give the asked number, the same every time", () => {
    expect(sparkSpecs(4)).toHaveLength(4);
    expect(sparkSpecs(4)).toEqual(sparkSpecs(4));
    expect(leafSpecs(2)).toHaveLength(2);
    expect(glowSpecs(3)).toHaveLength(3);
    expect(mistSpecs(2)).toEqual([
      { top: 18, delay: 0 },
      { top: 60, delay: 9 },
    ]);
  });

  it("keep the sparks on the screen and their motion small and slow", () => {
    for (const s of sparkSpecs(4)) {
      expect(s.left).toBeGreaterThanOrEqual(8);
      expect(s.left).toBeLessThanOrEqual(92);
      expect(Math.abs(s.dx)).toBeLessThanOrEqual(26);
      expect(s.drift).toBeGreaterThanOrEqual(8);
    }
  });
});
