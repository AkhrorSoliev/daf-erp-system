import { describe, expect, it } from "vitest";
import { nishonNomi, nishonQoldi } from "./nishon";

const q = (o: Partial<Parameters<typeof nishonQoldi>[0]>) => ({
  key: "SERIE_14",
  tur: "SERIE" as const,
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

  it("olingan — matn yo'q", () => {
    expect(nishonQoldi(q({ olingan: "2026-10-18T07:00:00.000Z", qoldi: null }))).toBeNull();
  });
});
