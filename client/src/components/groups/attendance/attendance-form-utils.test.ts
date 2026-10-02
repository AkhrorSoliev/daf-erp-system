import { describe, expect, it } from "vitest";
import { monthCoverageText } from "./attendance-form-utils";

describe("monthCoverageText", () => {
  it("says how many of the month's lessons are paid, and through which day", () => {
    expect(
      monthCoverageText("2026-10", {
        lessons: 13,
        paid: 5,
        paidThrough: "2026-10-12",
      }),
    ).toBe("Oktabr: 13 darsdan 5 tasi to'langan (12.10 gacha)");
  });

  it("says unpaid when the money reaches no lesson", () => {
    expect(
      monthCoverageText("2026-10", { lessons: 13, paid: 0, paidThrough: null }),
    ).toBe("Oktabr: to'lanmagan");
  });

  it("says paid when it reaches them all", () => {
    expect(
      monthCoverageText("2026-09", {
        lessons: 13,
        paid: 13,
        paidThrough: "2026-09-30",
      }),
    ).toBe("Sentabr: to'langan");
  });

  it("says the bill is not written yet without a charge", () => {
    expect(monthCoverageText("2026-10", null)).toBe(
      "Oktabr: hisob hali yozilmagan",
    );
  });
});
