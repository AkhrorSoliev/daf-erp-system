import { describe, expect, it } from "vitest";
import { normallashtir, qidir } from "./qidiruv";
import type { QollanmaSahifa } from "./turlar";

function sahifa(nom: string, sarlavha: string, qisqacha = "", kalitSozlar: string[] = []): QollanmaSahifa {
  return { bolim: "x", sahifa: nom, sarlavha, qisqacha, rollar: [1], adr: [], yollar: [], kalitSozlar, yangilangan: "2026-09-30" };
}

describe("qidiruv", () => {
  it("apostrof turlari bir xil", () => {
    expect(normallashtir("Oʻquvchi")).toBe("o'quvchi");
    expect(normallashtir("O'quvchi  ")).toBe("o'quvchi");
    expect(normallashtir("O'QUVCHI")).toBe("o'quvchi");
  });
  it("bo'sh so'rov — natija yo'q", () => {
    expect(qidir([sahifa("a", "To'lov")], "   ")).toEqual([]);
  });
  it("har so'z biror joyda bo'lishi shart", () => {
    const royxat = [sahifa("a", "Guruhdan chiqarish", "pul qaytadi"), sahifa("b", "Muzlatish")];
    expect(qidir(royxat, "chiqarish pul").map((s) => s.sahifa)).toEqual(["a"]);
    expect(qidir(royxat, "chiqarish avans")).toEqual([]);
  });
  it("sarlavhadagi moslik kalit so'zdagidan yuqori", () => {
    const royxat = [sahifa("a", "Qarzdorlik", "", ["avans"]), sahifa("b", "Avans")];
    expect(qidir(royxat, "avans").map((s) => s.sahifa)).toEqual(["b", "a"]);
  });
  it("o' bilan yozilgan so'rov o' li sarlavhani topadi", () => {
    expect(qidir([sahifa("a", "O'quvchi kartasi")], "o'quvchi").map((s) => s.sahifa)).toEqual(["a"]);
  });
});
