import { describe, expect, it } from "vitest";
import { LAYER_FACTOR, scenePlan } from "./ormon-sahna-rejasi";

describe("scenePlan", () => {
  it("draws three layers back to front, with sparks, leaves, mist and glows, and runs the parallax", () => {
    expect(scenePlan({ reduced: false, light: false })).toEqual({
      layers: [
        { id: "far", count: 2 },
        { id: "mid", count: 8 },
        { id: "near", count: 3 },
      ],
      glows: 3,
      sparks: 4,
      leaves: 2,
      mists: 2,
      parallax: true,
    });
  });

  it("halves everything on a weak device and drops the far layer", () => {
    expect(scenePlan({ reduced: false, light: true })).toEqual({
      layers: [
        { id: "mid", count: 4 },
        { id: "near", count: 2 },
      ],
      glows: 2,
      sparks: 2,
      leaves: 1,
      mists: 1,
      parallax: true,
    });
  });

  it("is a still picture under «Kam harakat»: no parallax, no sparks, no falling leaves", () => {
    for (const light of [false, true]) {
      const plan = scenePlan({ reduced: true, light });
      expect(plan.parallax).toBe(false);
      expect(plan.sparks).toBe(0);
      expect(plan.leaves).toBe(0);
      expect(plan.layers.length).toBeGreaterThan(0);
    }
  });

  it("moves the far layer slowest and the near one fastest", () => {
    expect(LAYER_FACTOR.far).toBeLessThan(LAYER_FACTOR.mid);
    expect(LAYER_FACTOR.mid).toBeLessThan(LAYER_FACTOR.near);
    expect(LAYER_FACTOR.near).toBeLessThan(1);
  });
});
