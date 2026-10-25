import { describe, expect, it } from "vitest";
import { KONFETI_RANGLARI, KONFETI_SONI, OGIRLIK, konfetiQadam, konfetiYarat } from "./konfeti";

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
    expect(zarralar).toHaveLength(KONFETI_SONI);
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
    const [z] = konfetiYarat(100, 200, sobit(0.5));
    const { x, y, vx, vy, a } = z;
    konfetiQadam([z]);
    expect(z.x).toBeCloseTo(x + vx);
    expect(z.y).toBeCloseTo(y + vy);
    expect(z.vy).toBeCloseTo(vy + OGIRLIK);
    expect(z.a).toBeCloseTo(a + 0.2);
  });
});
