import { describe, expect, it } from "vitest";
import { aniqlikFoizi, javobEffekti, natijaHissiyoti, natijaSarlavhasi, panelOhangi } from "./hissiyot";

const tayyor = (bestanden: boolean, avvalOtilgan = false) => ({
  tur: "tayyor" as const,
  natija: { bestanden, avvalOtilgan, togri: 12, jami: 15, kerak: 14 },
});

describe("javobEffekti", () => {
  it("a right answer rings and Dafi cheers", () => {
    expect(javobEffekti(true)).toEqual({ ovoz: "togri", dafi: "bayram" });
  });
  it("a wrong one is the soft miss, never a buzzer", () => {
    expect(javobEffekti(false)).toEqual({ ovoz: "xato", dafi: "xato" });
  });
});

describe("natijaHissiyoti", () => {
  it("an ordinary lesson or a review always celebrates", () => {
    expect(natijaHissiyoti(null)).toEqual({ bayram: true, dafi: "bayram" });
    expect(natijaHissiyoti(undefined)).toEqual({ bayram: true, dafi: "bayram" });
  });
  it("a final test waits for the server: Dafi thinks, nothing is celebrated yet", () => {
    expect(natijaHissiyoti({ tur: "kutilmoqda" })).toEqual({ bayram: false, dafi: "oylayapti" });
  });
  it("celebrates a final test only when the server says it was passed", () => {
    expect(natijaHissiyoti(tayyor(true))).toEqual({ bayram: true, dafi: "bayram" });
  });
  it("celebrates a passed final test also when it was passed before", () => {
    expect(natijaHissiyoti(tayyor(true, true))).toEqual({ bayram: true, dafi: "bayram" });
  });
  it("a failed attempt gets the soft miss, also when the test was passed before", () => {
    expect(natijaHissiyoti(tayyor(false))).toEqual({ bayram: false, dafi: "xato" });
    expect(natijaHissiyoti(tayyor(false, true))).toEqual({ bayram: false, dafi: "xato" });
  });
  it("a request that failed is not the student's miss: Dafi stays calm", () => {
    expect(natijaHissiyoti({ tur: "xato" })).toEqual({ bayram: false, dafi: "tinch" });
  });
});

describe("natijaSarlavhasi", () => {
  it("an ordinary lesson keeps «Dars tugadi!»", () => {
    expect(natijaSarlavhasi(null, false)).toBe("dars");
    expect(natijaSarlavhasi(undefined, false)).toBe("dars");
  });
  it("a review keeps its own heading", () => {
    expect(natijaSarlavhasi(null, true)).toBe("takrorlash");
    expect(natijaSarlavhasi(undefined, true)).toBe("takrorlash");
  });
  it("a passed final test keeps the celebratory heading", () => {
    expect(natijaSarlavhasi(tayyor(true), false)).toBe("dars");
    expect(natijaSarlavhasi(tayyor(true, true), false)).toBe("dars");
  });
  it("a final test that is not celebrated is neutral: pending, failed (also if passed before), request error", () => {
    expect(natijaSarlavhasi({ tur: "kutilmoqda" }, false)).toBe("neytral");
    expect(natijaSarlavhasi(tayyor(false), false)).toBe("neytral");
    expect(natijaSarlavhasi(tayyor(false, true), false)).toBe("neytral");
    expect(natijaSarlavhasi({ tur: "xato" }, false)).toBe("neytral");
  });
  it("the heading is neutral exactly when the screen does not celebrate a final test", () => {
    for (const sinov of [{ tur: "kutilmoqda" as const }, { tur: "xato" as const }, tayyor(true), tayyor(false), tayyor(false, true)]) {
      expect(natijaSarlavhasi(sinov, false) === "neytral").toBe(!natijaHissiyoti(sinov).bayram);
    }
  });
});

describe("aniqlikFoizi", () => {
  it("is the whole percent of right answers", () => {
    expect(aniqlikFoizi(12, 15)).toBe(80);
    expect(aniqlikFoizi(2, 3)).toBe(67);
    expect(aniqlikFoizi(15, 15)).toBe(100);
  });
  it("is 0 for an empty session", () => {
    expect(aniqlikFoizi(0, 0)).toBe(0);
  });
});

describe("panelOhangi", () => {
  it("has no tint before the check", () => {
    expect(panelOhangi(null, false)).toBeNull();
    expect(panelOhangi(null, true)).toBeNull();
  });
  it("is green after a right answer and the soft amber after a miss", () => {
    expect(panelOhangi({ isCorrect: true }, false)).toBe("togri");
    expect(panelOhangi({ isCorrect: false }, false)).toBe("xato");
  });
  it("a pairing question always ends with a green board: a first-try slip is not tinted amber", () => {
    expect(panelOhangi({ isCorrect: true }, true)).toBe("togri");
    expect(panelOhangi({ isCorrect: false }, true)).toBeNull();
  });
});
