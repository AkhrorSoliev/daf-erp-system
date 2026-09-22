import { describe, expect, it } from "vitest";
import { canEnterDaf, canOpenDafPath } from "./daf-nav";

describe("DaF ilovasi bo'limiga kirish", () => {
  it("CEO, filial direktori va administrator ikkala sahifani ochadi", () => {
    for (const role of [1, 2, 3]) {
      expect(canEnterDaf([role])).toBe(true);
      expect(canOpenDafPath([role], "/daf")).toBe(true);
      expect(canOpenDafPath([role], "/daf/oquvchilar")).toBe(true);
      expect(canOpenDafPath([role], "/daf/oquvchilar/")).toBe(true);
    }
  });

  it("o'qituvchi va kassir kira olmaydi", () => {
    expect(canEnterDaf([4])).toBe(false);
    expect(canEnterDaf([5])).toBe(false);
    expect(canOpenDafPath([4], "/daf")).toBe(false);
    expect(canOpenDafPath([5], "/daf/oquvchilar")).toBe(false);
  });

  it("menyuda yo'q yangi yo'l faqat CEO ga qoladi", () => {
    expect(canOpenDafPath([3], "/daf/kontent")).toBe(false);
    expect(canOpenDafPath([1], "/daf/kontent")).toBe(true);
  });
});
