import { describe, expect, it } from "vitest";
import { canEnterReports, canOpenReportPath } from "./reports-nav";

describe("hisobotlar bo'limiga kirish", () => {
  it("CEO va filial direktori hamma hisobotni ochadi", () => {
    for (const role of [1, 2]) {
      expect(canOpenReportPath([role], "/reports/payment-reports")).toBe(true);
      expect(canOpenReportPath([role], "/reports/leads")).toBe(true);
    }
  });

  it("administrator faqat Lidlar hisobotini ochadi", () => {
    expect(canEnterReports([3])).toBe(true);
    expect(canOpenReportPath([3], "/reports")).toBe(true);
    expect(canOpenReportPath([3], "/reports/leads")).toBe(true);
    expect(canOpenReportPath([3], "/reports/payment-reports")).toBe(false);
    expect(canOpenReportPath([3], "/reports/departed-students")).toBe(false);
  });

  it("menyuda yo'q yangi yo'l adminga o'z-o'zidan ochilmaydi", () => {
    expect(canOpenReportPath([3], "/reports/yangi-hisobot")).toBe(false);
    expect(canOpenReportPath([1], "/reports/yangi-hisobot")).toBe(true);
  });

  it("o'qituvchi va kassir kira olmaydi", () => {
    expect(canEnterReports([4])).toBe(false);
    expect(canEnterReports([5])).toBe(false);
    expect(canOpenReportPath([5], "/reports/leads")).toBe(false);
  });
});
