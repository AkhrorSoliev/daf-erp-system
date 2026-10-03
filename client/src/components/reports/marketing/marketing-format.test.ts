import { describe, expect, it } from "vitest";
import { formatRoi, roiSentence, type MarketingMonth } from "./marketing-format";

const norm = (s: string) => s.replace(/\s+/g, " ");
const money = (n: number) => norm(`${n.toLocaleString("uz-UZ")} so'm`);

const OCTOBER: MarketingMonth = {
  month: "2026-10",
  spend: 5_800_000,
  newStudents: 171,
  cac: 33_918,
  cohortPaid: 75_400_000,
  roi: 13,
  transition: false,
};

describe("formatRoi", () => {
  it("is a whole number from 10 up and one decimal below it", () => {
    expect(formatRoi(13)).toBe("13×");
    expect(formatRoi(12.6)).toBe("13×");
    expect(norm(formatRoi(3.44))).toBe(norm(`${(3.4).toLocaleString("uz-UZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`));
  });

  it("is «—» when there is nothing to show", () => {
    expect(formatRoi(null)).toBe("—");
  });
});

describe("roiSentence", () => {
  it("says how many times the spend came back when it did", () => {
    expect(norm(roiSentence(OCTOBER))).toBe(
      `Oktabrda qo'shilgan 171 o'quvchi hozirgacha ${money(75_400_000)} to'ladi — marketingga sarflangan ${money(5_800_000)} dan 13 barobar ko'p.`,
    );
  });

  it("says which share of the spend came back when it did not", () => {
    expect(norm(roiSentence({ ...OCTOBER, newStudents: 12, cohortPaid: 2_900_000, roi: 0.5 }))).toBe(
      `Oktabrda qo'shilgan 12 o'quvchi hozirgacha ${money(2_900_000)} to'ladi — sarfning 50% i.`,
    );
  });

  it("says nothing was spent, and that the transition months are not counted", () => {
    expect(roiSentence({ ...OCTOBER, spend: 0, roi: null })).toBe("Oktabrda marketingga sarf yozilmagan.");
    expect(roiSentence({ ...OCTOBER, month: "2026-06", transition: true, cac: null, cohortPaid: null, roi: null })).toBe(
      "May–iyun — tizimga o'tish oylari, hisoblanmaydi.",
    );
  });
});
