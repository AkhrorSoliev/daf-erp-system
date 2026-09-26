import { describe, expect, it } from "vitest";
import { coursePriceLabel, courseTermRows } from "./course-terms";

const sp = (s: string) => s.replace(/\s/g, " ");
const rows = (...a: Parameters<typeof courseTermRows>) =>
  courseTermRows(...a).map((r) => [r.label, sp(r.value)]);

describe("coursePriceLabel", () => {
  it("names the price by the payment model", () => {
    expect(coursePriceLabel("MONTHLY")).toBe("Oylik narx");
    expect(coursePriceLabel("LESSON_PACK")).toBe("Sikl narxi");
    expect(coursePriceLabel(null)).toBe("Narxi");
  });
});

describe("courseTermRows", () => {
  const schedule = { weeklyLessons: [3], monthLessons: { min: 12, max: 14 } };

  it("a monthly course: price a month, lessons a week and a month, one lesson", () => {
    expect(
      rows(
        { paymentModel: "MONTHLY", price: 580_000, lessonPaymentCount: 12 },
        schedule,
      ),
    ).toEqual([
      ["Oylik narx", "580 000 so'm"],
      ["Haftasiga", "3 dars"],
      ["Oyiga", "12–14 dars"],
      ["1 dars", "≈ 41 429 – 48 333 so'm"],
    ]);
  });

  it("does not show the cycle size for a monthly course", () => {
    const labels = courseTermRows(
      { paymentModel: "MONTHLY", price: 580_000, lessonPaymentCount: 12 },
      schedule,
    ).map((r) => r.label);
    expect(labels).not.toContain("Sikl darslari");
  });

  it("a cycle course: price of the cycle, its lessons, one lesson", () => {
    expect(
      rows(
        { paymentModel: "LESSON_PACK", price: 600_000, lessonPaymentCount: 12 },
        schedule,
      ),
    ).toEqual([
      ["Sikl narxi", "600 000 so'm"],
      ["Sikl darslari", "12 ta"],
      ["1 dars", "50 000 so'm"],
      ["Haftasiga", "3 dars"],
    ]);
  });

  it("lists every week size and says when no group has a schedule", () => {
    expect(
      rows(
        { paymentModel: "MONTHLY", price: 520_000, lessonPaymentCount: 12 },
        { weeklyLessons: [2, 3], monthLessons: { min: 8, max: 13 } },
      )[1],
    ).toEqual(["Haftasiga", "2 yoki 3 dars"]);
    expect(
      rows(
        { paymentModel: "MONTHLY", price: 520_000, lessonPaymentCount: 12 },
        { weeklyLessons: [], monthLessons: null },
      ),
    ).toEqual([
      ["Oylik narx", "520 000 so'm"],
      ["Haftasiga", "Guruhlarda dars jadvali yo'q"],
    ]);
  });
});
