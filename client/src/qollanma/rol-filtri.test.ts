import { describe, expect, it } from "vitest";
import { Rocket } from "lucide-react";
import { bolimlarRolUchun, sahifalarRolUchun } from "./rol-filtri";
import type { QollanmaBolim, QollanmaSahifa } from "./turlar";

function sahifa(bolim: string, nom: string, rollar: QollanmaSahifa["rollar"]): QollanmaSahifa {
  return { bolim, sahifa: nom, sarlavha: nom, qisqacha: "", rollar, adr: [], yollar: [], kalitSozlar: [], yangilangan: "2026-09-30" };
}
const bolim = (id: string): QollanmaBolim => ({ id, nom: id, tavsif: "", icon: Rocket });

describe("rol filtri", () => {
  const royxat = [sahifa("a", "kassa", [1, 2]), sahifa("a", "davomat", [1, 2, 3, 4]), sahifa("b", "oylik", [4])];

  it("rolga tegishli sahifalar", () => {
    expect(sahifalarRolUchun(royxat, [4]).map((s) => s.sahifa)).toEqual(["davomat", "oylik"]);
  });
  it("bir nechta rol — yig'indi", () => {
    expect(sahifalarRolUchun(royxat, [2, 4]).map((s) => s.sahifa)).toEqual(["kassa", "davomat", "oylik"]);
  });
  it("rolsiz foydalanuvchi hech narsa ko'rmaydi", () => {
    expect(sahifalarRolUchun(royxat, [])).toEqual([]);
  });
  it("bo'sh qolgan bo'lim tushib qoladi", () => {
    const guruhlar = bolimlarRolUchun([bolim("a"), bolim("b")], royxat, [2]);
    expect(guruhlar.map((g) => g.bolim.id)).toEqual(["a"]);
    expect(guruhlar[0].sahifalar.map((s) => s.sahifa)).toEqual(["kassa", "davomat"]);
  });
});
