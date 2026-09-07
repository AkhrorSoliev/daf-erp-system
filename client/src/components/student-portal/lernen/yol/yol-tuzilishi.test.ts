import { describe, expect, it } from "vitest";
import { qisqaRaqam, yolTugunlari } from "./yol-tuzilishi";

const seans = (id: number, done: boolean) => ({
  id, order: id, kind: "SECTION_A" as const, titleDe: "", titleUz: null,
  wordCount: 0, exerciseCount: 0,
  completedAt: done ? "2026-09-01T00:00:00.000Z" : null, bestScore: 0, runs: 0,
});

const bolim = (id: number, lessons: ReturnType<typeof seans>[]) => ({
  id, order: id, code: `u01-s${id}`, titleUz: `Bo'lim ${id}`, titleDe: `Teil ${id}`, lessons,
});

const unit = (id: number, sections: ReturnType<typeof bolim>[]) => ({
  id, order: id, titleUz: `Unit ${id}`, titleDe: `Einheit ${id}`,
  lessonCount: sections.flatMap((s) => s.lessons).length,
  doneCount: sections.flatMap((s) => s.lessons).filter((l) => l.completedAt).length,
  sections, finalTest: null,
});

const lvl = (level: string, units: ReturnType<typeof unit>[]) => ({ level, label: level, units });

describe("yolTugunlari", () => {
  it("unit sarlavhasidan keyin uning seanslari keladi", () => {
    const t = yolTugunlari([lvl("A1", [unit(1, [bolim(1, [seans(100, false), seans(101, false)])])])]);
    expect(t.map((x) => x.tur)).toEqual(["daraja", "unit", "seans", "seans"]);
  });

  it("birinchi tugallanmagan seans NAVBATDAGI, qolganlari qulf", () => {
    const t = yolTugunlari([
      lvl("A1", [unit(1, [bolim(1, [seans(100, true), seans(101, false), seans(102, false)])])]),
    ]);
    const seanslar = t.filter((x) => x.tur === "seans");
    expect(seanslar.map((s) => s.holat)).toEqual(["done", "active", "locked"]);
  });

  it("qulf BUTUN unit bo'ylab sanaladi, bo'lim ichida emas", () => {
    // Bo'lim ichida sanalsa har bo'limda bittadan "navbatdagi" yonardi.
    const t = yolTugunlari([
      lvl("A1", [unit(1, [
        bolim(1, [seans(100, true), seans(101, false)]),
        bolim(2, [seans(102, false), seans(103, false)]),
      ])]),
    ]);
    const aktiv = t.filter((x) => x.tur === "seans" && x.holat === "active");
    expect(aktiv).toHaveLength(1);
    expect(aktiv[0].id).toBe(101);
  });

  it("qulf UNITLAR bo'ylab ham davom etadi", () => {
    // 1-unit tugamagan bo'lsa 2-unitning birinchi seansi ham qulf.
    const t = yolTugunlari([
      lvl("A1", [
        unit(1, [bolim(1, [seans(100, false)])]),
        unit(2, [bolim(1, [seans(200, false)])]),
      ]),
    ]);
    const seanslar = t.filter((x) => x.tur === "seans");
    expect(seanslar.map((s) => s.holat)).toEqual(["active", "locked"]);
  });

  it("kontenti yo'q daraja qulflangan bitta tugun bo'ladi", () => {
    const t = yolTugunlari([
      lvl("A1", [unit(1, [bolim(1, [seans(100, false)])])]),
      lvl("A2", []),
    ]);
    const a2 = t.filter((x) => x.daraja === "A2");
    expect(a2.map((x) => x.tur)).toEqual(["daraja", "tez-orada"]);
  });

  it("bo'limi yo'q unit sarlavha bo'lib qoladi, seanssiz", () => {
    // Eski DiB unitlarida bo'lim yo'q — yo'l ular ustida yiqilmasin.
    const t = yolTugunlari([lvl("A1", [unit(1, [])])]);
    expect(t.map((x) => x.tur)).toEqual(["daraja", "unit"]);
  });

  it("bo'sh ro'yxat bo'sh yo'l", () => {
    expect(yolTugunlari([])).toEqual([]);
  });
});

describe("qisqaRaqam", () => {
  it("ming va undan kattasini qisqartiradi", () => {
    expect(qisqaRaqam(1_240)).toBe("1.2k");
    expect(qisqaRaqam(16_000)).toBe("16k");
  });

  it("mingdan kichigini o'zgartirmaydi", () => {
    expect(qisqaRaqam(0)).toBe("0");
    expect(qisqaRaqam(999)).toBe("999");
  });
});
