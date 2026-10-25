import { describe, expect, it } from "vitest";
import { DAFI_HOLATLARI, DAFI_OLCHAM, RIG_HOLAT, javobHolati } from "./dafi-holat";

describe("dafi holatlari", () => {
  it("has the five states of the spec and a rig state for each", () => {
    expect([...DAFI_HOLATLARI]).toEqual(["tinch", "salom", "bayram", "oylayapti", "xato"]);
    for (const h of DAFI_HOLATLARI) expect(RIG_HOLAT[h]).toBeTruthy();
  });
  it("a right answer cheers, a wrong one is the soft miss (never punishing)", () => {
    expect(javobHolati(true)).toBe("bayram");
    expect(javobHolati(false)).toBe("xato");
  });
  it("has three sizes", () => {
    expect(Object.keys(DAFI_OLCHAM)).toEqual(["sm", "md", "lg"]);
  });
});
