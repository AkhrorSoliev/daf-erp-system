import { describe, expect, it } from "vitest";
import {
  foizRangi,
  formatDavomiylik,
  formatKunOy,
  formatKunYorligi,
  formatOxirgiFaollik,
  formatSanaToshkent,
  haftaKuni,
  hechQachonKirmaganmi,
} from "./activity-format";

describe("formatDavomiylik", () => {
  it("soniyalarni daqiqa va soatga", () => {
    expect(formatDavomiylik(0)).toBe("0 daq");
    expect(formatDavomiylik(59)).toBe("<1 daq");
    expect(formatDavomiylik(60)).toBe("1 daq");
    expect(formatDavomiylik(3600)).toBe("1 soat");
    expect(formatDavomiylik(4830)).toBe("1 soat 20 daq");
  });
});

describe("sanalar", () => {
  it("kun.oy va hafta kuni satrdan (vaqt mintaqasiga bog'liq emas)", () => {
    expect(formatKunOy("2026-09-13")).toBe("13.09");
    expect(haftaKuni("2026-09-13")).toBe("Yak");
    expect(haftaKuni("2026-09-14")).toBe("Du");
    expect(formatKunYorligi("2026-09-14")).toBe("14.09 (Du)");
  });

  it("oxirgi faollik Toshkent vaqti bo'yicha", () => {
    const now = new Date("2026-09-13T10:00:00Z"); // 15:00 Toshkent
    expect(formatOxirgiFaollik(null, now)).toBe("Ilovaga hali kirmagan");
    expect(formatOxirgiFaollik("2026-09-13T09:58:00Z", now)).toBe("Hozirgina");
    expect(formatOxirgiFaollik("2026-09-13T04:05:00Z", now)).toBe("Bugun, 09:05");
    expect(formatOxirgiFaollik("2026-09-12T18:30:00Z", now)).toBe("Kecha, 23:30");
    expect(formatOxirgiFaollik("2026-09-12T19:30:00Z", now)).toBe("Bugun, 00:30");
    expect(formatOxirgiFaollik("2026-09-09T10:00:00Z", now)).toBe("4 kun oldin");
  });
});

describe("foizRangi", () => {
  it("80 va 60 chegaralari, amber ishlatilmaydi", () => {
    expect(foizRangi(null)).toContain("muted");
    expect(foizRangi(80)).toContain("green");
    expect(foizRangi(60)).toContain("yellow");
    expect(foizRangi(59)).toContain("red");
    expect(foizRangi(70)).not.toContain("amber");
  });
});

describe("formatSanaToshkent", () => {
  it("UTC yarim tunga yaqin vaqtni Toshkent kuniga o'giradi (topilma 4)", () => {
    // 2026-09-12T20:30:00Z == 2026-09-13T01:30 Toshkent — kechagi emas, ertangi kun.
    expect(formatSanaToshkent("2026-09-12T20:30:00Z")).toBe("13.09");
    expect(formatSanaToshkent("2026-09-13T10:00:00Z")).toBe("13.09");
  });
});

describe("hechQachonKirmaganmi", () => {
  const boshFortschritt = { gesamt: 0, stufe: { de: "", uz: "" }, serie: 0 };
  const boshMashq = { savollar: 0, togri: 0, xatolar: 0, foiz: null, konikmalar: [] };
  const darajaQator = (tugatilgan: number) =>
    ({ daraja: "A1" as const, tugatilgan, jami: 5, holat: "DAVOM" as const, tugatilganSana: null });

  it("hech narsa yo'q bo'lsa — chin", () => {
    expect(
      hechQachonKirmaganmi({
        oxirgiFaollik: null,
        fortschritt: boshFortschritt,
        darajalar: [darajaQator(0)],
        mashq: boshMashq,
      }),
    ).toBe(true);
  });

  it("mashq qilingan, lekin ilova seansi yo'q — yolg'on (topilma 2)", () => {
    expect(
      hechQachonKirmaganmi({
        oxirgiFaollik: null,
        fortschritt: boshFortschritt,
        darajalar: [darajaQator(0)],
        mashq: { ...boshMashq, savollar: 3 },
      }),
    ).toBe(false);
  });

  it("dars tugatilgan bo'lsa — yolg'on", () => {
    expect(
      hechQachonKirmaganmi({
        oxirgiFaollik: null,
        fortschritt: boshFortschritt,
        darajalar: [darajaQator(2)],
        mashq: boshMashq,
      }),
    ).toBe(false);
  });

  it("ball bor bo'lsa — yolg'on", () => {
    expect(
      hechQachonKirmaganmi({
        oxirgiFaollik: null,
        fortschritt: { ...boshFortschritt, gesamt: 10 },
        darajalar: [darajaQator(0)],
        mashq: boshMashq,
      }),
    ).toBe(false);
  });

  it("ilova seansi bor bo'lsa — yolg'on", () => {
    expect(
      hechQachonKirmaganmi({
        oxirgiFaollik: { vaqt: "2026-09-13T05:00:00Z", platforma: "WEB" },
        fortschritt: boshFortschritt,
        darajalar: [darajaQator(0)],
        mashq: boshMashq,
      }),
    ).toBe(false);
  });
});
