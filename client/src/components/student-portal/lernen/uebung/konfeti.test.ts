import { describe, expect, it } from "vitest";
import {
  KONFETI_KADRLARI,
  KONFETI_RANGLARI,
  KONFETI_SONI,
  OGIRLIK,
  konfetiQadam,
  konfetiYarat,
} from "./konfeti";

const sobit = (v: number) => () => v;

/** A fixed pseudo-random sequence, so the test sees the same burst every run. */
function urug() {
  let s = 7;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

describe("konfetiYarat", () => {
  it("throws a hundred pieces from one point, upwards", () => {
    const zarralar = konfetiYarat(180, 330, sobit(0.5));
    expect(zarralar).toHaveLength(100);
    expect(KONFETI_SONI).toBe(100);
    for (const z of zarralar) {
      expect([z.x, z.y]).toEqual([180, 330]);
      expect(z.vy).toBeLessThan(0);
    }
  });

  it("keeps every speed and size inside the mockup's ranges, at both ends of the random scale", () => {
    for (const r of [0, 0.999999]) {
      for (const z of konfetiYarat(0, 0, sobit(r))) {
        expect(z.vx).toBeGreaterThanOrEqual(-7);
        expect(z.vx).toBeLessThanOrEqual(7);
        expect(z.vy).toBeGreaterThanOrEqual(-14);
        expect(z.vy).toBeLessThanOrEqual(-3);
        expect(z.r).toBeGreaterThanOrEqual(4);
        expect(z.r).toBeLessThanOrEqual(8);
        expect(KONFETI_RANGLARI).toContain(z.rang);
      }
    }
  });

  it("uses all five colours of the palette", () => {
    const ranglar = new Set(konfetiYarat(0, 0, urug()).map((z) => z.rang));
    expect(ranglar.size).toBe(KONFETI_RANGLARI.length);
  });
});

describe("konfetiQadam", () => {
  it("moves every piece by its speed, then gravity slows it on the way up", () => {
    // 0.75 on the random scale gives vx = 3.5, vy = -5.75, a = 4.5: a sideways speed that is
    // not zero, so a dropped or reversed x move cannot hide behind `x + 0`.
    const [z] = konfetiYarat(100, 200, sobit(0.75));
    expect([z.vx, z.vy, z.a]).toEqual([3.5, -5.75, 4.5]);
    konfetiQadam([z]);
    expect(z.x).toBeCloseTo(103.5);
    expect(z.y).toBeCloseTo(194.25);
    expect(z.vy).toBeCloseTo(-5.75 + OGIRLIK);
    expect(z.vx).toBe(3.5);
    expect(z.a).toBeCloseTo(4.7);
  });

  it("lets every piece fall below where it was thrown from by the last frame", () => {
    // The slowest piece (vy = -14) is back below its start at about frame 68.
    for (const r of [0, 0.999999]) {
      const zarralar = konfetiYarat(50, 300, sobit(r));
      for (let kadr = 0; kadr < KONFETI_KADRLARI; kadr++) konfetiQadam(zarralar);
      for (const z of zarralar) expect(z.y).toBeGreaterThan(300);
    }
  });
});
