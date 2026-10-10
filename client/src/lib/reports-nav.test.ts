import { describe, expect, it } from "vitest";
import { canForRoles } from "@/test-support/server-catalog";
import { canEnterReports, canOpenReportPath } from "./reports-nav";

describe("hisobotlar bo'limiga kirish", () => {
  it("CEO va filial direktori hamma hisobotni ochadi", () => {
    for (const role of [1, 2]) {
      expect(canOpenReportPath(canForRoles([role]), "/reports/payment-reports")).toBe(true);
      expect(canOpenReportPath(canForRoles([role]), "/reports/leads")).toBe(true);
    }
  });

  it("administrator Lidlar va To'lov hisobotlarini ochadi, boshqa pul hisobotlarini ochmaydi", () => {
    expect(canEnterReports(canForRoles([3]))).toBe(true);
    expect(canOpenReportPath(canForRoles([3]), "/reports")).toBe(true);
    expect(canOpenReportPath(canForRoles([3]), "/reports/leads")).toBe(true);
    expect(canOpenReportPath(canForRoles([3]), "/reports/payment-reports")).toBe(true);
    expect(canOpenReportPath(canForRoles([3]), "/reports/student-payments")).toBe(false);
    expect(canOpenReportPath(canForRoles([3]), "/reports/departed-students")).toBe(false);
  });

  it("menyuda yo'q yangi yo'l adminga o'z-o'zidan ochilmaydi", () => {
    expect(canOpenReportPath(canForRoles([3]), "/reports/yangi-hisobot")).toBe(false);
    expect(canOpenReportPath(canForRoles([1]), "/reports/yangi-hisobot")).toBe(true);
  });

  it("o'qituvchi va kassir kira olmaydi", () => {
    expect(canEnterReports(canForRoles([4]))).toBe(false);
    expect(canEnterReports(canForRoles([5]))).toBe(false);
    expect(canOpenReportPath(canForRoles([5]), "/reports/leads")).toBe(false);
    expect(canOpenReportPath(canForRoles([4]), "/reports/payment-reports")).toBe(false);
    expect(canOpenReportPath(canForRoles([5]), "/reports/payment-reports")).toBe(false);
  });

  it("Marketing — pul hisoboti: CEO va filial direktori ochadi, administrator ochmaydi", () => {
    expect(canOpenReportPath(canForRoles([1]), "/reports/marketing")).toBe(true);
    expect(canOpenReportPath(canForRoles([2]), "/reports/marketing")).toBe(true);
    expect(canOpenReportPath(canForRoles([3]), "/reports/marketing")).toBe(false);
  });
});
