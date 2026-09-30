import { describe, expect, it } from "vitest";
import { sahifalarYolUchun, yolMosmi } from "./yol-moslash";
import type { QollanmaSahifa } from "./turlar";

describe("yo'l moslash", () => {
  it("aniq yo'l", () => {
    expect(yolMosmi("/payments/debt", "/payments/debt")).toBe(true);
    expect(yolMosmi("/payments/debt", "/payments/debt/")).toBe(true);
    expect(yolMosmi("/payments/debt", "/payments/debt?tab=markaz")).toBe(true);
    expect(yolMosmi("/payments/debt", "/payments")).toBe(false);
  });
  it("bosh sahifa faqat o'zi", () => {
    expect(yolMosmi("/", "/")).toBe(true);
    expect(yolMosmi("/", "/students")).toBe(false);
  });
  it("/* — bir yoki bir nechta segment", () => {
    expect(yolMosmi("/students/profile/*", "/students/profile/10231")).toBe(true);
    expect(yolMosmi("/students/profile/*", "/students/profile/10231/x")).toBe(true);
    expect(yolMosmi("/students/profile/*", "/students/profile")).toBe(false);
    expect(yolMosmi("/students/profile/*", "/students/profiles/1")).toBe(false);
  });
  it("reyestr tartibi saqlanadi", () => {
    const s = (nom: string, yollar: string[]): QollanmaSahifa => ({ bolim: "x", sahifa: nom, sarlavha: nom, qisqacha: "", rollar: [1], adr: [], yollar, kalitSozlar: [], yangilangan: "2026-09-30" });
    const royxat = [s("karta", ["/students/profile/*"]), s("boshqa", ["/groups"]), s("chiqarish", ["/students/profile/*"])];
    expect(sahifalarYolUchun(royxat, "/students/profile/5").map((x) => x.sahifa)).toEqual(["karta", "chiqarish"]);
  });
});
