import { describe, expect, it } from "vitest";
import { breakdownRows } from "./chart-breakdown-rows";

const b = {
  revenue: 1000,
  teacherSalary: 400,
  adminSalary: 100,
  operatingExpenses: 200,
  refunds: 50,
  netProfit: 250,
};

describe("breakdownRows", () => {
  it("ulushni TUSHUMGA nisbatan hisoblaydi", () => {
    const rows = breakdownRows(b);
    expect(rows.find((r) => r.key === "teacherSalary")!.pct).toBe(40);
    expect(rows.find((r) => r.key === "netProfit")!.pct).toBe(25);
  });

  it("qatorlar yig'indisi tushumga teng — hech narsa yo'qolmaydi", () => {
    const rows = breakdownRows(b);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(b.revenue);
  });

  it("nol qiymatli qator chizilmaydi", () => {
    const rows = breakdownRows({ ...b, refunds: 0 });
    expect(rows.map((r) => r.key)).not.toContain("refunds");
  });

  it("zarar bo'lgan oyda sof foyda manfiy ko'rsatiladi", () => {
    const rows = breakdownRows({ ...b, netProfit: -120 });
    const p = rows.find((r) => r.key === "netProfit")!;
    expect(p.amount).toBe(-120);
    expect(p.kind).toBe("profit");
  });

  it("tushum nol bo'lsa foiz 0 bo'ladi, nolga bo'linmaydi", () => {
    const rows = breakdownRows({ ...b, revenue: 0 });
    expect(rows.every((r) => Number.isFinite(r.pct))).toBe(true);
  });
});
