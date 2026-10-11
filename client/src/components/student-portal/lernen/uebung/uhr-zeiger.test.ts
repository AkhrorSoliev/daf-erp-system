import { describe, expect, it } from "vitest";
import { punktAufKreis, zeigerWinkel } from "./uhr-zeiger";

describe("zeigerWinkel", () => {
  it.each([
    ["12:00", 0, 0],
    ["03:00", 90, 0],
    // The hour hand moves with the minutes: halfway between 3 and 4.
    ["03:30", 105, 180],
    ["09:45", 292.5, 270],
    ["06:15", 187.5, 90],
    ["12:30", 15, 180],
    ["11:55", 357.5, 330],
    // A 24-hour time draws the same face.
    ["15:30", 105, 180],
  ])("%s → hour %d°, minute %d°", (zeit, stunde, minute) => {
    expect(zeigerWinkel(zeit)).toEqual({ stunde, minute });
  });

  it.each(["3:30", "24:00", "12:60", "", "ab:cd"])("refuses %p", (zeit) => {
    expect(zeigerWinkel(zeit)).toBeNull();
  });
});

describe("punktAufKreis", () => {
  it("0° is twelve o'clock, angles go clockwise", () => {
    expect(punktAufKreis(0, 40)).toEqual({ x: 50, y: 10 });
    expect(punktAufKreis(90, 40)).toEqual({ x: 90, y: 50 });
    expect(punktAufKreis(180, 40)).toEqual({ x: 50, y: 90 });
    expect(punktAufKreis(270, 40)).toEqual({ x: 10, y: 50 });
  });
});
