import { describe, expect, it } from "vitest";
import { kamHarakatQarori, yengilRejimmi } from "./kam-harakat";

describe("kamHarakatQarori", () => {
  it("follows the system setting when the student made no choice", () => {
    expect(kamHarakatQarori(null, true)).toBe(true);
    expect(kamHarakatQarori(null, false)).toBe(false);
  });
  it("a device choice to reduce always wins", () => {
    expect(kamHarakatQarori(true, false)).toBe(true);
  });
  it("never turns motion back on against the system setting", () => {
    expect(kamHarakatQarori(false, true)).toBe(true);
  });
});

describe("yengilRejimmi", () => {
  it("is light on a weak device", () => {
    expect(yengilRejimmi({ yadro: 4 })).toBe(true);
    expect(yengilRejimmi({ xotira: 2 })).toBe(true);
  });
  it("is full on a normal device or when the browser says nothing", () => {
    expect(yengilRejimmi({ yadro: 8, xotira: 8 })).toBe(false);
    expect(yengilRejimmi({})).toBe(false);
  });
});
