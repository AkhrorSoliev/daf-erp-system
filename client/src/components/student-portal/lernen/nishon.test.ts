import { describe, expect, it } from "vitest";
import { nishonNomi, nishonQoldi } from "./nishon";
import type { NishonQatori } from "./types";

const q = (o: Partial<Parameters<typeof nishonQoldi>[0]>) => ({
  key: "SERIE_14",
  tur: "SERIE" as NishonQatori["tur"],
  chegara: 14,
  olingan: null,
  qoldi: 4,
  ...o,
});

describe("nishonNomi", () => {
  it("kalitdan nom", () => {
    expect(nishonNomi("SERIE_14")).toBe("14 kun ketma-ket");
    expect(nishonNomi("WOERTER_150")).toBe("150 ta so'z");
    expect(nishonNomi("WOERTER_592")).toBe("A1 so'zlarining hammasi");
  });

  it("noma'lum kalit o'zgarmaydi", () => {
    expect(nishonNomi("LIGA_1")).toBe("LIGA_1");
  });

  it("musobaqa nishonlari (S3)", () => {
    expect(nishonNomi("LIGA_KUMUSH")).toBe("Kumush ligasi");
    expect(nishonNomi("LIGA_OLMOS")).toBe("Olmos ligasi");
    expect(nishonNomi("XONA_GOLIB")).toBe("Xona g'olibi");
    expect(nishonNomi("GURUH_BIRINCHI")).toBe("Guruhlar jadvalida 1-o'rin");
    expect(nishonNomi("LIGA_TEMIR")).toBe("LIGA_TEMIR");
  });

  it("jang nishoni nomi", () => {
    expect(nishonNomi("JANG_50")).toBe("50 ta jang g'alabasi");
  });
});

describe("nishonQoldi", () => {
  it("olinmagan: yana N kun / N ta so'z", () => {
    expect(nishonQoldi(q({}))).toBe("yana 4 kun");
    expect(nishonQoldi(q({ key: "WOERTER_150", tur: "WOERTER", chegara: 150, qoldi: 30 }))).toBe(
      "yana 30 ta so'z",
    );
  });

  it("sharti bajarilgan, hali berilmagan", () => {
    expect(nishonQoldi(q({ qoldi: 0 }))).toBe("Keyingi mashqda beriladi");
  });

  it("musobaqa nishoni: nima qilish kerakligi", () => {
    expect(nishonQoldi(q({ key: "LIGA_OLTIN", tur: "LIGA", chegara: 2, qoldi: 1 }))).toBe(
      "Oltin ligasiga ko'tarilganda",
    );
    expect(nishonQoldi(q({ key: "XONA_GOLIB", tur: "XONA", chegara: 1, qoldi: 1 }))).toBe(
      "Xonada 1-o'rin, kamida 50 ball, xonada kamida 5 kishi bo'lsa",
    );
    expect(nishonQoldi(q({ key: "LIGA_X", tur: "LIGA", chegara: 9, qoldi: 1 }))).toBe(
      "Yuqori ligaga ko'tarilganda",
    );
    expect(
      nishonQoldi(q({ key: "YANGI_1", tur: "YANGI" as NishonQatori["tur"], chegara: 1, qoldi: 1 })),
    ).toBeNull();
    expect(nishonQoldi(q({ key: "GURUH_BIRINCHI", tur: "GURUH", chegara: 1, qoldi: 1 }))).toBe(
      "Guruhingiz hafta jadvalida 1-o'rin olganda",
    );
    expect(nishonQoldi(q({ key: "LIGA_KUMUSH", tur: "LIGA", chegara: 1, qoldi: 0 }))).toBe(
      "Keyingi mashqda beriladi",
    );
  });

  it("olingan — matn yo'q", () => {
    expect(nishonQoldi(q({ olingan: "2026-10-18T07:00:00.000Z", qoldi: null }))).toBeNull();
  });

  it("names and hints go through the page's t; an unknown key stays as sent", () => {
    const t = (s: string, p?: Record<string, string | number>) =>
      `[${s.replace(/\{(\w+)\}/g, (_, k: string) => String(p?.[k]))}]`;
    expect(nishonNomi("SERIE_14", t)).toBe("[14 kun ketma-ket]");
    expect(nishonNomi("LIGA_KUMUSH", t)).toBe("[[Kumush] ligasi]");
    expect(nishonNomi("LIGA_TEMIR", t)).toBe("LIGA_TEMIR");
    expect(nishonQoldi(q({}), t)).toBe("[yana 4 kun]");
  });
});
