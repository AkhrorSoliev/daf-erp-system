import { describe, expect, it } from "vitest";
import { layerOffset, parallaxMode, scenePaused } from "./parallaks";

describe("layerOffset", () => {
  it("moves a layer by its factor of the scroll, up the screen", () => {
    expect(layerOffset(0, 0.5, 640)).toBe(0);
    expect(layerOffset(100, 0.5, 640)).toBe(-50);
    expect(layerOffset(100, 0.2, 640)).toBeCloseTo(-20);
  });

  it("wraps every tile, so a layer never runs out however long the path is", () => {
    expect(layerOffset(1280, 0.5, 640)).toBe(0);
    expect(layerOffset(1300, 0.5, 640)).toBe(-10);
    expect(layerOffset(64_000, 0.5, 640)).toBe(0);
  });

  it("stays within one tile above its rest, also for the bounce above the top of the page", () => {
    for (const y of [-120, -1, 0, 1, 333, 639, 640, 641, 5_000, 123_457]) {
      const v = layerOffset(y, 0.5, 640);
      expect(v).toBeLessThanOrEqual(0);
      expect(v).toBeGreaterThan(-640);
    }
  });
});

describe("scenePaused", () => {
  it("holds the scene still while the tab is hidden or the scene is off screen", () => {
    expect(scenePaused({ hidden: false, offscreen: false })).toBe(false);
    expect(scenePaused({ hidden: true, offscreen: false })).toBe(true);
    expect(scenePaused({ hidden: false, offscreen: true })).toBe(true);
  });
});

describe("parallaxMode", () => {
  // A hidden tab used to clear every layer's transform, so on the way back the
  // first frames drew offset 0 and then snapped. Only a scene with no parallax at
  // all rests at 0; a paused one keeps where it was.
  it("rests the layers at 0 only where there is no parallax: «Kam harakat» and the system setting", () => {
    expect(parallaxMode({ parallax: false, paused: false })).toBe("off");
    expect(parallaxMode({ parallax: false, paused: true })).toBe("off");
  });

  it("keeps the layers where they are while a scene with a parallax is paused", () => {
    expect(parallaxMode({ parallax: true, paused: true })).toBe("paused");
  });

  it("follows the scroll when there is a parallax and the scene is shown", () => {
    expect(parallaxMode({ parallax: true, paused: false })).toBe("follows");
  });
});
