import { describe, expect, it } from "vitest";
import { darajaFoizi, qisqaRaqam, yolQatorMetasi, yolTugunlari } from "./yol-tuzilishi";

const seans = (id: number, done: boolean) => ({
  id, order: id, kind: "SECTION_A" as const, titleDe: "", titleUz: null,
  wordCount: 0, exerciseCount: 0,
  completedAt: done ? "2026-09-01T00:00:00.000Z" : null, bestScore: 0, runs: 0,
});

const bolim = (id: number, lessons: ReturnType<typeof seans>[]) => ({
  id, order: id, code: `u01-s${id}`, titleUz: `Bo'lim ${id}`, titleDe: `Teil ${id}`, lessons,
});

const unit = (
  id: number,
  sections: ReturnType<typeof bolim>[],
  finalTest: ReturnType<typeof seans> | null = null,
) => ({
  id, order: id, titleUz: `Unit ${id}`, titleDe: `Einheit ${id}`,
  lessonCount: sections.flatMap((s) => s.lessons).length,
  doneCount: sections.flatMap((s) => s.lessons).filter((l) => l.completedAt).length,
  sections, finalTest,
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

  // Finding 4: server `finalTest`ni har unit uchun alohida qaytaradi, lekin
  // `yolTugunlari` faqat `unit.sections`ni yurar edi — `UNIT_TEST` seansi
  // hech qanday tugun bermay, qulf zanjiridan butunlay tashqarida qolardi.
  it("unitning yakuniy sinovi bo'limlardan KEYIN o'z tuguniga ega bo'ladi", () => {
    const test100 = seans(999, false);
    const t = yolTugunlari([
      lvl("A1", [unit(1, [bolim(1, [seans(100, true)])], test100)]),
    ]);
    expect(t.map((x) => x.tur)).toEqual(["daraja", "unit", "seans", "seans"]);
    const seanslar = t.filter((x) => x.tur === "seans");
    expect(seanslar.map((s) => s.id)).toEqual([100, 999]);
    // Bo'limning yagona seansi tugatilgan — navbat yakuniy sinovga o'tadi,
    // xuddi bo'lim ekranidagi qulf zanjiri kabi.
    expect(seanslar.map((s) => s.holat)).toEqual(["done", "active"]);
    expect(seanslar[1].ostyozuv).toBe("Yakuniy sinov");
  });

  it("yakuniy sinov ham BUTUN yo'l qulf zanjiriga qatnashadi — keyingi unit uni kutadi", () => {
    const test1 = seans(999, false);
    const t = yolTugunlari([
      lvl("A1", [
        unit(1, [bolim(1, [seans(100, true)])], test1),
        unit(2, [bolim(2, [seans(200, false)])]),
      ]),
    ]);
    const seanslar = t.filter((x) => x.tur === "seans");
    // 100 — done, 999 (yakuniy sinov) — active, 200 — hali qulf: unit 1
    // yakuniy sinovi topshirilmaguncha unit 2 boshlanmaydi.
    expect(seanslar.map((s) => s.holat)).toEqual(["done", "active", "locked"]);
  });
});

describe("yolQatorMetasi", () => {
  const seansIndexlari = (t: ReturnType<typeof yolTugunlari>) =>
    t.map((x, i) => (x.tur === "seans" ? i : null)).filter((i): i is number => i !== null);

  it("zigzag bosqichi unit sarlavhasi ustidan TO'XTAMASDAN o'tadi", () => {
    // Ikki unit, har biri ikkita seans bilan: unit sarlavhasi orasida
    // kirib turishi zigzagni 0dan qayta boshlamasligi kerak — aks holda
    // har unit boshida bir xil tekislanish takrorlanib, naqsh notekis
    // ko'rinardi.
    const t = yolTugunlari([
      lvl("A1", [
        unit(1, [bolim(1, [seans(100, false), seans(101, false)])]),
        unit(2, [bolim(2, [seans(200, false), seans(201, false)])]),
      ]),
    ]);
    const meta = yolQatorMetasi(t);
    const bosqichlar = seansIndexlari(t).map((i) => meta[i].zigzagBosqichi);
    expect(bosqichlar).toEqual([0, 1, 2, 3]);
  });

  it("daraja yorlig'i ham zigzag sanog'ini o'zgartirmaydi", () => {
    const t = yolTugunlari([
      lvl("A1", [unit(1, [bolim(1, [seans(100, false)])])]),
      lvl("A2", [unit(2, [bolim(2, [seans(200, false)])])]),
    ]);
    const meta = yolQatorMetasi(t);
    const bosqichlar = seansIndexlari(t).map((i) => meta[i].zigzagBosqichi);
    expect(bosqichlar).toEqual([0, 1]);
  });

  it("bitta unit ichida bo'lim o'zgarmasa yorliq faqat birinchi seansda ko'rinadi", () => {
    const t = yolTugunlari([
      lvl("A1", [unit(1, [bolim(1, [seans(100, false), seans(101, false)])])]),
    ]);
    const meta = yolQatorMetasi(t);
    const korinadimi = seansIndexlari(t).map((i) => meta[i].ostyozuvKorinsinmi);
    expect(korinadimi).toEqual([true, false]);
  });

  it("bo'lim yorlig'i xotirasi UNIT chegarasida tozalanadi — bir xil nomli bo'lim ham qayta ko'rsatiladi", () => {
    // `bolim(1, ...)` ikkala unitda ham "Bo'lim 1" nomini beradi —
    // ATAYLAB bir xil. Bular ikki BOSHQA bo'lim (turli unitga tegishli),
    // shuning uchun ikkinchisi ham o'z yorlig'ini ko'rsatishi kerak;
    // xotira tozalanmasa, tasodifan mos kelgan nom uni jimgina yutib
    // yuborardi.
    const t = yolTugunlari([
      lvl("A1", [
        unit(1, [bolim(1, [seans(100, false)])]),
        unit(2, [bolim(1, [seans(200, false)])]),
      ]),
    ]);
    const meta = yolQatorMetasi(t);
    const korinadimi = seansIndexlari(t).map((i) => meta[i].ostyozuvKorinsinmi);
    expect(korinadimi).toEqual([true, true]);
  });

  it("bo'sh ro'yxat bo'sh meta", () => {
    expect(yolQatorMetasi([])).toEqual([]);
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

describe("darajaFoizi", () => {
  it("band boshida 0% (Kenner'ga endi kirgan — 1500/1500..4000)", () => {
    expect(darajaFoizi(1_500, 1_500, 4_000)).toBe(0);
  });

  it("band o'rtasida bandning o'zidan hisoblaydi, gesamtdan emas", () => {
    // 1500..4000 bandining o'rtasi 2750, gesamt/ab (2750/4000=68.75%) EMAS.
    expect(darajaFoizi(2_750, 1_500, 4_000)).toBe(50);
  });

  it("keyingi chegaraga aynan yetganda 100%", () => {
    expect(darajaFoizi(4_000, 1_500, 4_000)).toBe(100);
  });

  it("eng yuqori darajada (keyingisi yo'q) har doim 100%", () => {
    expect(darajaFoizi(20_000, 16_000, null)).toBe(100);
  });
});
