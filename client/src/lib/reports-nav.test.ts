import { describe, expect, it } from "vitest";
import { canForRoles } from "@/test-support/server-catalog";
import { canEnterReports, canOpenReportPath, reportsNavSections } from "./reports-nav";
import { routeLabels } from "./breadcrumb-routes";

describe("hisobotlar bo'limiga kirish", () => {
  it("CEO va filial direktori hamma hisobotni ochadi", () => {
    for (const role of [1, 2]) {
      expect(canOpenReportPath(canForRoles([role]), "/reports/payment-reports", [role])).toBe(true);
      expect(canOpenReportPath(canForRoles([role]), "/reports/leads", [role])).toBe(true);
    }
  });

  it("administrator Lidlar va «Guruhlar bo'yicha to'lov»ni ochadi, boshqa pul hisobotlarini ochmaydi", () => {
    expect(canEnterReports(canForRoles([3]), [3])).toBe(true);
    expect(canOpenReportPath(canForRoles([3]), "/reports", [3])).toBe(true);
    expect(canOpenReportPath(canForRoles([3]), "/reports/leads", [3])).toBe(true);
    expect(canOpenReportPath(canForRoles([3]), "/reports/payment-reports", [3])).toBe(true);
    expect(canOpenReportPath(canForRoles([3]), "/reports/student-payments", [3])).toBe(false);
    expect(canOpenReportPath(canForRoles([3]), "/reports/departed-students", [3])).toBe(false);
  });

  it("«Moliyaviy hisobotlar»da faqat «Guruhlar bo'yicha to'lov» bor; havolasi va imkoniyati o'zgarmagan", () => {
    const section = reportsNavSections.find((s) => s.title === "Moliyaviy hisobotlar");
    expect(section?.items.map((i) => [i.title, i.url, i.permission])).toEqual([
      ["Guruhlar bo'yicha to'lov", "/reports/payment-reports", "reports.payments"],
    ]);
    expect(routeLabels["payment-reports"]).toBe("Guruhlar bo'yicha to'lov");
    expect(reportsNavSections.flatMap((s) => s.items).some((i) => i.url === "/reports/student-payments")).toBe(false);
  });

  it("menyuda yo'q yangi yo'l adminga o'z-o'zidan ochilmaydi", () => {
    expect(canOpenReportPath(canForRoles([3]), "/reports/yangi-hisobot", [3])).toBe(false);
    expect(canOpenReportPath(canForRoles([1]), "/reports/yangi-hisobot", [1])).toBe(true);
  });

  it("o'qituvchi va kassir kira olmaydi", () => {
    expect(canEnterReports(canForRoles([4]), [4])).toBe(false);
    expect(canEnterReports(canForRoles([5]), [5])).toBe(false);
    expect(canOpenReportPath(canForRoles([5]), "/reports/leads", [5])).toBe(false);
    expect(canOpenReportPath(canForRoles([4]), "/reports/payment-reports", [4])).toBe(false);
    expect(canOpenReportPath(canForRoles([5]), "/reports/payment-reports", [5])).toBe(false);
  });

  it("Marketing — pul hisoboti: CEO va filial direktori ochadi, administrator ochmaydi", () => {
    expect(canOpenReportPath(canForRoles([1]), "/reports/marketing", [1])).toBe(true);
    expect(canOpenReportPath(canForRoles([2]), "/reports/marketing", [2])).toBe(true);
    expect(canOpenReportPath(canForRoles([3]), "/reports/marketing", [3])).toBe(false);
  });
});

describe("Dars baholari — faqat CEO", () => {
  it("opens for the CEO and nobody else", () => {
    expect(canOpenReportPath(canForRoles([1]), "/reports/dars-baholari", [1])).toBe(true);
    for (const role of [2, 3, 4, 5]) {
      expect(canOpenReportPath(canForRoles([role]), "/reports/dars-baholari", [role])).toBe(false);
    }
  });
});

describe("Xodimlar KPI — kpi.view (ADR-0094)", () => {
  it("CEO va filial direktori ochadi; administrator, o'qituvchi va kassir ochmaydi", () => {
    for (const role of [1, 2]) {
      expect(canOpenReportPath(canForRoles([role]), "/reports/xodimlar-kpi", [role])).toBe(true);
    }
    for (const role of [3, 4, 5]) {
      expect(canOpenReportPath(canForRoles([role]), "/reports/xodimlar-kpi", [role])).toBe(false);
    }
    expect(routeLabels["xodimlar-kpi"]).toBe("Xodimlar KPI");
  });
});
