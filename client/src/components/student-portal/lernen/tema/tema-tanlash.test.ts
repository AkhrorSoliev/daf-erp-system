import { describe, expect, it } from "vitest";
import { joriyTemaId } from "./tema-tanlash";

describe("joriyTemaId", () => {
  it("the account wins over the device cache", () => {
    expect(joriyTemaId("alp", "toza")).toBe("alp");
  });
  it("uses the device cache until the profile has loaded", () => {
    expect(joriyTemaId(undefined, "dengiz")).toBe("dengiz");
  });
  it("a profile answer of null means the default, not the cache of another account", () => {
    expect(joriyTemaId(null, "dengiz")).toBe("toza");
  });
  it("falls back to the default for anything unknown", () => {
    expect(joriyTemaId("neon", "bad")).toBe("toza");
    expect(joriyTemaId(undefined, null)).toBe("toza");
  });
});
