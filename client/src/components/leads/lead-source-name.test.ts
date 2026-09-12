import { describe, expect, it } from "vitest";
import { LEAD_SOURCE_NAME_MAX, normalizeSourceName } from "./lead-source-name";

describe("normalizeSourceName", () => {
  it("atrofdagi bo'shliqlarni olib tashlaydi", () => {
    expect(normalizeSourceName("  YouTube  ")).toBe("YouTube");
  });

  it("bo'sh nomni rad etadi", () => {
    expect(normalizeSourceName("")).toBeNull();
  });

  it("faqat bo'shliqdan iborat nomni rad etadi", () => {
    expect(normalizeSourceName("   ")).toBeNull();
  });

  it("chegaradagi uzunlikni qabul qiladi", () => {
    const name = "a".repeat(LEAD_SOURCE_NAME_MAX);
    expect(normalizeSourceName(name)).toBe(name);
  });

  it("chegaradan uzun nomni rad etadi", () => {
    expect(normalizeSourceName("a".repeat(LEAD_SOURCE_NAME_MAX + 1))).toBeNull();
  });
});
