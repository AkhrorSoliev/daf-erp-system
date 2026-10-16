import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import { drawerSubtitle, PAY_STATUS_LABEL, pctText, pctTone, STUDENT_MARK_LABEL, studentAmountText, summaryTitle } from "./group-payments-format";

describe("percent", () => {
  it("colour follows the printed whole number: ≥ 90 green, ≥ 50 amber, below red, none muted", () => {
    expect([90, 89.6, 89.4, 50, 49.5, 49.4, 0].map(pctTone)).toEqual(["green", "green", "amber", "amber", "amber", "red", "red"]);
    expect(pctTone(null)).toBe("muted");
  });
  it("whole on screen; «—» when nothing was charged", () => {
    expect(pctText(76.9)).toBe("77%");
    expect(pctText(50)).toBe("50%");
    expect(pctText(null)).toBe("—");
  });
});

describe("texts", () => {
  it("the card title names the month", () => expect(summaryTitle("2026-10")).toBe("Oktabr oyi to'lovlari — guruhlar kesimida"));
  it("a paid student shows what was charged, the others what is left", () => {
    expect(studentAmountText({ status: "toladi", charged: 450_000, unpaid: 0 })).toBe(`hisoblandi ${formatPrice(450_000)}`);
    expect(studentAmountText({ status: "qisman", charged: 450_000, unpaid: 360_000 })).toBe(`qoldi ${formatPrice(360_000)}`);
  });
  it("the drawer subtitle: course · teachers · students; «Ustozsiz» without a teacher", () => {
    const g = { id: "g1", name: "A1-01", course: "Nemis tili A1", teachers: ["Aziza Rahimova", "Olim Karimov"], deleted: false, closed: false };
    expect(drawerSubtitle(g, 2)).toBe("Nemis tili A1 · Aziza Rahimova, Olim Karimov · 2 o'quvchi");
    expect(drawerSubtitle({ ...g, teachers: [] }, 1)).toBe("Nemis tili A1 · Ustozsiz · 1 o'quvchi");
  });
  it("status and mark labels", () => {
    expect(PAY_STATUS_LABEL).toEqual({ toladi: "to'ladi", qisman: "qisman", tolamagan: "to'lamagan" });
    expect(STUDENT_MARK_LABEL).toEqual({ arxivda: "arxivda", muzlatilgan: "muzlatilgan", chiqqan: "guruhdan chiqqan" });
  });
});
