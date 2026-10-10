import { describe, expect, it } from "vitest";
import { canForRoles } from "@/test-support/server-catalog";
import { canEnterDaf, canOpenDafPath } from "./daf-nav";

describe("DaF ilovasi bo'limiga kirish", () => {
  it("CEO, filial direktori va administrator ikkala sahifani ochadi", () => {
    for (const role of [1, 2, 3]) {
      const can = canForRoles([role]);
      expect(canEnterDaf(can)).toBe(true);
      expect(canOpenDafPath(can, "/daf", [role])).toBe(true);
      expect(canOpenDafPath(can, "/daf/oquvchilar", [role])).toBe(true);
      expect(canOpenDafPath(can, "/daf/oquvchilar/", [role])).toBe(true);
    }
  });

  it("o'qituvchi va kassir kira olmaydi", () => {
    expect(canEnterDaf(canForRoles([4]))).toBe(false);
    expect(canEnterDaf(canForRoles([5]))).toBe(false);
    expect(canOpenDafPath(canForRoles([4]), "/daf", [4])).toBe(false);
    expect(canOpenDafPath(canForRoles([5]), "/daf/oquvchilar", [5])).toBe(false);
  });

  it("menyuda yo'q yangi yo'l faqat CEO ga qoladi", () => {
    expect(canOpenDafPath(canForRoles([3]), "/daf/kontent", [3])).toBe(false);
    expect(canOpenDafPath(canForRoles([1]), "/daf/kontent", [1])).toBe(true);
  });
});
