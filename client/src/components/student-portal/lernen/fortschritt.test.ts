import { describe, expect, it } from "vitest";
import { seansHolatlari, unitHolati } from "./fortschritt";

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

describe("unitHolati", () => {
  const u = (order: number, lessonCount: number, doneCount: number) => ({
    id: order, order, titleUz: "", titleDe: "", lessonCount, doneCount,
  });

  it("birinchi unit har doim ochiq", () => {
    expect(unitHolati([u(1, 18, 0)])).toEqual(["OCHIQ"]);
  });

  it("kontenti yo`q unit QULF va `tez orada`", () => {
    expect(unitHolati([u(1, 18, 18), u(2, 0, 0)]))
      .toEqual(["BAJARILGAN", "TAYYOR_EMAS"]);
  });

  it("oldingisi tugamaguncha keyingisi qulf", () => {
    expect(unitHolati([u(1, 18, 4), u(2, 18, 0)]))
      .toEqual(["OCHIQ", "QULF"]);
  });

  it("oldingisi tugagach keyingisi ochiladi", () => {
    expect(unitHolati([u(1, 18, 18), u(2, 18, 0)]))
      .toEqual(["BAJARILGAN", "OCHIQ"]);
  });

  it("kontenti yo`q unitdan keyingisi ham yopiq qoladi", () => {
    // Ataylab: 2-unit bo'sh bo'lsa 3-unit ham yopiq qoladi. Kontent
    // tartib bilan yoziladi, shuning uchun 2 bo'sh bo'lsa 3 ham bo'sh.
    expect(unitHolati([u(1, 18, 18), u(2, 0, 0), u(3, 0, 0)]))
      .toEqual(["BAJARILGAN", "TAYYOR_EMAS", "TAYYOR_EMAS"]);
  });

  it("bo`sh unitdan keyingisi, o`zi kontentga ega bo`lsa ham, QULF bo`ladi", () => {
    // Yuqoridagi holatning bosh farqi: 3-unit endi BO'SH EMAS (18 dars
    // bor), lekin baribir OCHIQ emas. Bo'sh 2-unit "oldingisi tugagan"
    // bayrog'ini ataylab `false`ga uzatadi — shu mexanizmni aynan shu
    // yerda tekshiramiz, TAYYOR_EMAS emas, QULF kutiladi.
    expect(unitHolati([u(1, 18, 18), u(2, 0, 0), u(3, 18, 0)]))
      .toEqual(["BAJARILGAN", "TAYYOR_EMAS", "QULF"]);
  });
});
