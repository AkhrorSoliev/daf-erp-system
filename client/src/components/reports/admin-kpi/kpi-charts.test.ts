import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DailyTooltip, KpiDailyChart, KpiMonthsChart, MonthsTooltip, topRadius } from "./kpi-charts";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const day = { day: 5, current: 3, compare: 2 };

describe("KpiDailyChart", () => {
  it("names both months when the compare month has data", () => {
    const out = html(createElement(DailyTooltip, { active: true, payload: [{ payload: day }], month: "2026-11", compare: "2026-10", compareAvailable: true }));
    expect(out).toContain("Noyabr");
    expect(out).toContain("Oktabr");
  });

  it("draws only the selected month in the tooltip when the compare month has no data", () => {
    const out = html(createElement(DailyTooltip, { active: true, payload: [{ payload: day }], month: "2026-10", compare: "2026-09", compareAvailable: false }));
    expect(out).toContain("Oktabr");
    expect(out).not.toContain("Sentabr");
  });

  it("leaves a missing day (null) out of the tooltip", () => {
    const out = html(createElement(DailyTooltip, { active: true, payload: [{ payload: { day: 20, current: null, compare: 4 } }], month: "2026-11", compare: "2026-10", compareAvailable: true }));
    expect(out).not.toContain("Noyabr");
    expect(out).toContain("Oktabr");
  });

  it("is empty when only the hidden compare month has results", () => {
    const data = [{ day: 1, current: 0, compare: 5 }];
    const hidden = html(createElement(KpiDailyChart, { data, month: "2026-10", compare: "2026-09", compareAvailable: false }));
    const shown = html(createElement(KpiDailyChart, { data, month: "2026-10", compare: "2026-09", compareAvailable: true }));
    expect(hidden).toContain("boshqa oyni tanlab ko");
    expect(shown).not.toContain("boshqa oyni tanlab ko");
  });

  it("does not mention the compare month in the subtitle when it is hidden", () => {
    const data = [{ day: 1, current: 1, compare: 5 }];
    const out = html(createElement(KpiDailyChart, { data, month: "2026-10", compare: "2026-09", compareAvailable: false }));
    expect(out).not.toContain("Sentabr");
  });
});

describe("MonthsTooltip", () => {
  const row = { month: "2026-10", leadPaid: 4, promiseKept: 0, amount: 40000 };
  it("hides the zero segment and prints the total", () => {
    const out = html(createElement(MonthsTooltip, { active: true, payload: [{ payload: row }] }));
    expect(out).toContain("Lid to&#x27;lov qildi");
    expect(out).not.toContain("Va&#x27;da bajarildi");
    expect(out).toContain("Jami");
  });
});

describe("chart legends", () => {
  const data = [{ day: 1, current: 1, compare: 5 }];
  it("names both months when the compare month has data", () => {
    const out = html(createElement(KpiDailyChart, { data, month: "2026-11", compare: "2026-10", compareAvailable: true }));
    expect(out).toContain("<li");
    expect(out).toContain("dashed");
    expect(out.match(/<li/g)).toHaveLength(2);
  });

  it("has no compare entry when the compare month has no data", () => {
    const out = html(createElement(KpiDailyChart, { data, month: "2026-10", compare: "2026-09", compareAvailable: false }));
    expect(out.match(/<li/g)).toHaveLength(1);
    expect(out).not.toContain("dashed");
  });

  it("keys the stacked months", () => {
    const out = html(createElement(KpiMonthsChart, { data: [{ month: "2026-10", leadPaid: 2, promiseKept: 1, amount: 3 }] }));
    expect(out).toContain("Lid to&#x27;lov qildi");
    expect(out).toContain("Va&#x27;da bajarildi");
  });
});

describe("topRadius", () => {
  it("rounds the lead bar only when no promise part is above it", () => {
    expect(topRadius({ promiseKept: 0 }, "lead")).toEqual([4, 4, 0, 0]);
    expect(topRadius({ promiseKept: 2 }, "lead")).toBe(0);
    expect(topRadius({ promiseKept: 2 }, "promise")).toEqual([4, 4, 0, 0]);
  });
});
