import { describe, expect, it } from "vitest";
import { joriyUnitIndeksi } from "./joriy-unit";

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
