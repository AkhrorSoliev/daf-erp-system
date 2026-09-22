import { describe, expect, it } from "vitest";
import { juftSoni } from "./yigish";

/**
 * `juftSoni` ikki tomonda (mijoz va server) BIR XIL bo'lishi shart —
 * server nechta juft kutayotgani bilan mos kelmasa, javob shakli buzilgan
 * hisoblanadi va BUTUNLAY xato bo'ladi (server: `satz-fragen.ts`dagi
 * `ZUORDNEN_JUFT = 6`, mijozdagi `PAAR`ning eski qulflangan `4`).
 */
describe("juftSoni", () => {
  it("PAAR — 4 juft", () => {
    expect(juftSoni("PAAR")).toBe(4);
  });

  it("ZUORDNEN — 6 juft", () => {
    expect(juftSoni("ZUORDNEN")).toBe(6);
  });

  it("ikkisi teng emas — funksiya doim 4 qaytarib qo'yishi mumkin emasligini ushlaydi", () => {
    expect(juftSoni("PAAR")).not.toBe(juftSoni("ZUORDNEN"));
  });
});
