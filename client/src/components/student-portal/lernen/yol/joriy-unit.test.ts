import { describe, expect, it } from "vitest";
import { joriyUnitIndeksi, joriyUnitTartibi } from "./joriy-unit";

describe("joriyUnitIndeksi", () => {
  // tops are the units' distances from the viewport top, in px
  it("is the first unit while none has scrolled past the line", () => {
    expect(joriyUnitIndeksi([300, 900, 1500], 120)).toBe(0);
  });
  it("is the last unit whose top has passed the line", () => {
    expect(joriyUnitIndeksi([-700, 80, 760], 120)).toBe(1);
    expect(joriyUnitIndeksi([-1700, -900, 100], 120)).toBe(2);
  });
  it("is 0 for an empty list", () => {
    expect(joriyUnitIndeksi([], 120)).toBe(0);
  });
});

describe("joriyUnitTartibi", () => {
  const levels = [
    { units: [{ id: 7, order: 1 }, { id: 9, order: 2 }] },
    { units: [{ id: 31, order: 1 }] },
  ];

  it("is the order in its level of the unit the path reports", () => {
    expect(joriyUnitTartibi(levels, 9)).toBe(2);
    expect(joriyUnitTartibi(levels, 31)).toBe(1);
  });

  it("is 1 while the path has not loaded, no unit is reported or the id is unknown", () => {
    expect(joriyUnitTartibi(undefined, 9)).toBe(1);
    expect(joriyUnitTartibi(levels, null)).toBe(1);
    expect(joriyUnitTartibi(levels, 404)).toBe(1);
  });
});
