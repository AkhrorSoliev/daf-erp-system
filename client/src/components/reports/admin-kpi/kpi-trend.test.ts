import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrendLine, TrendMark } from "./kpi-trend";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("TrendLine / TrendMark", () => {
  it("render nothing when the compare month has no KPI data", () => {
    expect(html(createElement(TrendLine, { value: 5, compare: 3, unit: "count", compareAvailable: false }))).toBe("");
    expect(html(createElement(TrendMark, { value: 5, compare: 3, unit: "count", compareAvailable: false }))).toBe("");
  });

  it("render the line and the arrow when it has", () => {
    const line = html(createElement(TrendLine, { value: 5, compare: 3, unit: "count", compareAvailable: true }));
    expect(line).toContain("▲ 2");
    expect(line).toContain("text-green-600");
    const mark = html(createElement(TrendMark, { value: 3, compare: 5, unit: "count", compareAvailable: true }));
    expect(mark).toContain("▼");
    expect(mark).toContain("text-destructive");
  });

  it("names the compare figure with its unit in the aria-label", () => {
    const som = html(createElement(TrendMark, { value: 1, compare: 20_000, unit: "som", compareAvailable: true }));
    expect(som).toContain("taqqoslanayotgan oyda 20");
    expect(som).toContain("so&#x27;m");
    expect(html(createElement(TrendMark, { value: 1, compare: 55, unit: "pct", compareAvailable: true }))).toContain(
      "55%",
    );
  });
});
