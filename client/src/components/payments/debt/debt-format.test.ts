import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format-utils";
import { debtSpan, drawerStatus, dueCell, instantDateTime, promiseCard, promiseText, sumLine, tabRule } from "./debt-format";

describe("debt cells (spec §2.3–2.5)", () => {
  it("«To'lov muddati»: «dd.MM gacha» before the day, red «o'tgan · dd.MM» on and after it", () => {
    expect(dueCell("2026-10-16", "2026-10-14")).toEqual({ text: "16.10 gacha", overdue: false });
    expect(dueCell("2026-10-14", "2026-10-14")).toEqual({ text: "o'tgan · 14.10", overdue: true });
    expect(dueCell(null, "2026-10-14")).toBeNull();
  });

  it("«Va'da»: open and broken, and the drawer's line", () => {
    expect(promiseText({ state: "open", promiseDate: "2026-10-17", promisedAmount: null })).toBe("17.10 gacha");
    expect(promiseText({ state: "broken", promiseDate: "2026-10-09", promisedAmount: null })).toBe("buzildi · 09.10");
    expect(promiseCard({ state: "open", promiseDate: "2026-10-17", promisedAmount: 350_000 }))
      .toEqual({ title: "Va'da berilgan", detail: `${formatNumber(350_000)} so'm · 17.10 gacha` });
    expect(promiseCard({ state: "broken", promiseDate: "2026-10-05", promisedAmount: null }))
      .toEqual({ title: "Va'da buzildi", detail: "05.10 gacha edi" });
  });

  it("«Topildi» with a filter, «Jami» (the tab's total) without", () => {
    expect(sumLine(true, 3, 905_000, { total: 1, count: 1 })).toBe(`Topildi: 3 ta · ${formatNumber(905_000)} so'm`);
    expect(sumLine(false, 3, 905_000, { total: 1_350_000, count: 4 })).toBe(`Jami: ${formatNumber(1_350_000)} so'm · 4 ta`);
  });

  it("the drawer's span line counts only months still owed, and names the oldest", () => {
    const line = (month: string | null, left: number) => ({ month, label: month ? null : "Sinov imtihoni", charged: null, paid: null, left });
    expect(debtSpan([line("2026-10", 400_000), line("2026-08", 250_000), line("2026-09", 0), line(null, 40_000)])).toBe("2 oy bo'yicha · eng eskisi avgust");
    expect(debtSpan([line("2026-09", 70_000)])).toBe("sentabr oyi uchun");
    expect(debtSpan([line(null, 40_000)])).toBeNull();
  });

  it("the drawer's status: «o'qiyapti» without a kind", () => {
    expect(drawerStatus(null)).toBe("o'qiyapti");
    expect(drawerStatus("frozen")).toBe("muzlatilgan");
  });

  it("an instant's Tashkent date and time", () => {
    expect(instantDateTime("2026-10-03T09:20:00Z")).toBe("03.10.2026, 14:20");
  });

  it("the Shu oy rule names the month and drops «(1-oktabrdan amal qiladi)»", () => {
    const text = tabRule("shu-oy", "2026-11");
    expect(text.startsWith("Noyabr to'lovini hali to'liq to'lamagan")).toBe(true);
    expect(text).not.toContain("1-oktabrdan");
  });
});
