import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DepartedMonths } from "./departed-months";

const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const MONTHS = [
  { key: "2026-05", departed: 10, provisional: false },
  { key: "2026-06", departed: 20, provisional: false },
  { key: "2026-07", departed: 5, provisional: false },
  { key: "2026-08", departed: 0, provisional: false },
  { key: "2026-09", departed: 15, provisional: false },
  { key: "2026-10", departed: 8, provisional: true },
];
const render = (months: typeof MONTHS) => renderToStaticMarkup(createElement(DepartedMonths, { months }));

describe("DepartedMonths", () => {
  it("short month names, the counts, heights relative to the tallest column, one spoken line", () => {
    const html = render(MONTHS);
    expect(norm(html)).toContain("10 may 20 iyun 5 iyul 0 avg 15 sen 8 okt");
    expect(html).toContain("height:100%");
    expect(html).toContain("height:25%");
    expect(html).toContain('aria-label="May 10, iyun 20, iyul 5, avgust 0, sentabr 15, oktabr 8"');
  });
  it("the unfinished month is faint and the note appears", () => {
    const html = render(MONTHS);
    expect(html).toContain("opacity-50");
    expect(norm(html)).toContain("Och rangdagi oylar dastlabki: qaytish muddati tugamagan.");
  });
  it("no unfinished month: no faint column and no note", () => {
    const html = render(MONTHS.map((m) => ({ ...m, provisional: false })));
    expect(html).not.toContain("opacity-50");
    expect(norm(html)).not.toContain("dastlabki");
  });
  it("all zeros do not divide by zero", () => {
    expect(render(MONTHS.map((m) => ({ ...m, departed: 0 })))).not.toContain("NaN");
  });
  it("a zero month keeps a visible baseline, a non-zero one is solid", () => {
    const html = render(MONTHS);
    expect(html).toContain("min-h-px bg-muted");
    expect(html.match(/bg-primary/g)).toHaveLength(5);
    expect(html).not.toContain("<em");
  });
  it("loading draws a skeleton", () => {
    expect(renderToStaticMarkup(createElement(DepartedMonths, { months: undefined, isLoading: true }))).toContain('data-slot="skeleton"');
  });
});
