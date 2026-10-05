import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format-utils";
import { drawerMonthText, dueCell, promiseLine, promiseText, sumLine, tabRule } from "./debt-format";

describe("debt cells (spec §2.3–2.5)", () => {
  it("«To'lov muddati»: «dd.MM gacha» before the day, red «o'tgan · dd.MM» on and after it", () => {
    expect(dueCell("2026-10-16", "2026-10-14")).toEqual({ text: "16.10 gacha", overdue: false });
    expect(dueCell("2026-10-14", "2026-10-14")).toEqual({ text: "o'tgan · 14.10", overdue: true });
    expect(dueCell(null, "2026-10-14")).toBeNull();
  });

  it("«Va'da»: open and broken, and the drawer's line", () => {
    expect(promiseText({ state: "open", promiseDate: "2026-10-17", promisedAmount: null })).toBe("17.10 gacha");
    expect(promiseText({ state: "broken", promiseDate: "2026-10-09", promisedAmount: null })).toBe("buzildi · 09.10");
    expect(promiseLine({ state: "open", promiseDate: "2026-10-17", promisedAmount: 350_000 })).toBe(`Va'da: ${formatNumber(350_000)} so'm, 17.10 gacha`);
  });

  it("«Topildi» with a filter, «Jami» (the tab's total) without", () => {
    expect(sumLine(true, 3, 905_000, { total: 1, count: 1 })).toBe(`Topildi: 3 ta · ${formatNumber(905_000)} so'm`);
    expect(sumLine(false, 3, 905_000, { total: 1_350_000, count: 4 })).toBe(`Jami: ${formatNumber(1_350_000)} so'm · 4 ta`);
  });

  it("the drawer's month line", () => {
    expect(drawerMonthText({ month: "2026-09", charged: 450_000, paid: 400_000, left: 50_000 }))
      .toBe(`hisoblandi ${formatNumber(450_000)} · to'landi ${formatNumber(400_000)} · qoldi ${formatNumber(50_000)}`);
    expect(drawerMonthText({ month: "2026-08", charged: null, paid: null, left: 30_000 })).toBe(`qoldi ${formatNumber(30_000)}`);
  });

  it("the Shu oy rule names the month and drops «(1-oktabrdan amal qiladi)»", () => {
    const text = tabRule("shu-oy", "2026-11");
    expect(text.startsWith("Noyabr to'lovini hali to'liq to'lamagan")).toBe(true);
    expect(text).not.toContain("1-oktabrdan");
  });
});
