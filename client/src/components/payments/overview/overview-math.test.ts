import { describe, expect, it } from "vitest";
import {
  clampMonth,
  dayMonth,
  isMonthlyBillingMonth,
  monthRange,
  profitLines,
  som,
} from "./overview-math";

describe("clampMonth", () => {
  it("keeps a month inside the range", () => {
    expect(clampMonth("2026-08", "2026-05", "2026-10")).toBe("2026-08");
  });

  it("lifts a month before the floor and lowers one after the current month", () => {
    expect(clampMonth("2026-01", "2026-05", "2026-10")).toBe("2026-05");
    expect(clampMonth("2027-01", "2026-05", "2026-10")).toBe("2026-10");
  });

  it("reads anything unreadable as the current month", () => {
    for (const raw of ["", "2026-13", "oktabr", "2026-9"]) {
      expect(clampMonth(raw, "2026-05", "2026-10")).toBe("2026-10");
    }
  });
});

describe("monthRange", () => {
  it("is the month's first and last day", () => {
    expect(monthRange("2026-10")).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(monthRange("2027-02")).toEqual({ startDate: "2027-02-01", endDate: "2027-02-28" });
  });
});

describe("isMonthlyBillingMonth", () => {
  it("starts with September 2026", () => {
    expect(isMonthlyBillingMonth("2026-08")).toBe(false);
    expect(isMonthlyBillingMonth("2026-09")).toBe(true);
  });
});

describe("dayMonth and som", () => {
  it('writes a day as "dd.MM"', () => {
    expect(dayMonth("2026-10-14")).toBe("14.10");
  });

  it("prints so'm after the number and «—» for a missing figure", () => {
    expect(som(1_500_000)).toBe(`${(1_500_000).toLocaleString("uz-UZ")} so'm`);
    expect(som(-500_000)).toBe(`${(-500_000).toLocaleString("uz-UZ")} so'm`);
    expect(som(null)).toBe("—");
    expect(som(undefined)).toBe("—");
  });
});

describe("profitLines", () => {
  const composition = {
    revenue: { total: 175_400_000 },
    withdrawals: { total: 1_200_000 },
    teachers: { total: 80_400_000 },
    staff: { total: 14_900_000 },
    expenses: { total: 13_800_000 },
    refunds: 500_000,
  };

  it("adds up to the net profit, in the dialog's order", () => {
    const lines = profitLines(composition);
    expect(lines.map((l) => l.label)).toEqual([
      "O'tilgan darslar puli",
      "Balansdan yechib olingan",
      "Ustozlar oyligi",
      "Xodimlar oyligi",
      "Boshqa xarajatlar",
      "Qaytarilgan pul",
    ]);
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(
      175_400_000 + 1_200_000 - 80_400_000 - 14_900_000 - 13_800_000 - 500_000,
    );
  });

  it("leaves out withdrawals and refunds that are 0, or absent on an older server", () => {
    const zero = profitLines({ ...composition, withdrawals: { total: 0 }, refunds: 0 }).map((l) => l.label);
    expect(zero).toEqual(["O'tilgan darslar puli", "Ustozlar oyligi", "Xodimlar oyligi", "Boshqa xarajatlar"]);
    expect(profitLines({ ...composition, withdrawals: undefined }).map((l) => l.label)).not.toContain(
      "Balansdan yechib olingan",
    );
  });
});
