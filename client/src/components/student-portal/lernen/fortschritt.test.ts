import { describe, expect, it } from "vitest";
import { seansHolatlari } from "./fortschritt";

const s = (id: number, done: boolean) => ({
  id, order: id, kind: null, titleDe: "", titleUz: null,
  wordCount: 0, exerciseCount: 0,
  completedAt: done ? "2026-09-01T00:00:00.000Z" : null,
  bestScore: 0, runs: done ? 1 : 0,
});

describe("seansHolatlari", () => {
  it("birinchi tugallanmagan seans NAVBATDAGI, qolganlari QULF", () => {
    expect(seansHolatlari([s(1, true), s(2, false), s(3, false)]))
      .toEqual(["BAJARILGAN", "NAVBATDAGI", "QULF"]);
  });

  it("hech narsa bajarilmagan bo`lsa birinchisi ochiq", () => {
    expect(seansHolatlari([s(1, false), s(2, false)]))
      .toEqual(["NAVBATDAGI", "QULF"]);
  });

  it("hammasi bajarilgan bo`lsa qulf qolmaydi", () => {
    expect(seansHolatlari([s(1, true), s(2, true)]))
      .toEqual(["BAJARILGAN", "BAJARILGAN"]);
  });

  it("o`rtadagi seans o`tkazib yuborilgan bo`lsa ham NAVBATDAGI bitta", () => {
    // O'quvchi 3-ni qandaydir yo'l bilan bajargan bo'lsa (masalan
    // to'g'ridan-to'g'ri havola orqali), 2-si baribir keyingi qadam
    // bo'lib qoladi — ketma-ketlik buzilmaydi.
    expect(seansHolatlari([s(1, true), s(2, false), s(3, true)]))
      .toEqual(["BAJARILGAN", "NAVBATDAGI", "BAJARILGAN"]);
  });

  it("bo`sh ro`yxat bo`sh natija", () => {
    expect(seansHolatlari([])).toEqual([]);
  });
});
