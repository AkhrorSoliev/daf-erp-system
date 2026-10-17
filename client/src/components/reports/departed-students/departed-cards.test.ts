import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DepartedCards } from "./departed-cards";
import type { DepartedOverview } from "./departed-types";

const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const render = (props: Record<string, unknown>) => norm(renderToStaticMarkup(createElement(DepartedCards, props as never)));

// Made-up numbers.
const DATA = {
  range: { startDate: "2026-09-01", endDate: "2026-09-30" },
  cards: { departed: 6, previousDeparted: 4, atStart: 50, per100: 12, avgStudyMonths: 3.4 },
} as DepartedOverview;

describe("DepartedCards", () => {
  it("three cards: departed with the previous period, per 100, study months", () => {
    const text = render({ data: DATA, previousLabel: "avgustda", isLoading: false });
    expect(text).toContain("Sentabrda ketdi 6 o'quvchi avgustda 4 edi");
    expect(text).toContain("Har 100 o'quvchidan 12 tasi ketdi davr boshida 50 o'quvchi o'qiyotgan edi");
    expect(text).toContain("Ketguncha o'qidi 3,4 oy o'rtacha");
  });
  it("a period over several months is not named after one month", () => {
    const data = { ...DATA, range: { startDate: "2026-07-01", endDate: "2026-09-30" } } as DepartedOverview;
    expect(render({ data, previousLabel: "oldingi 3 oyda", isLoading: false })).toContain("Shu davrda ketdi");
  });
  it("nobody at the start: the second card is a dash", () => {
    const data = { ...DATA, cards: { ...DATA.cards, atStart: 0, per100: null, avgStudyMonths: null } } as DepartedOverview;
    const text = render({ data, previousLabel: "avgustda", isLoading: false });
    expect(text).toContain("Har 100 o'quvchidan — davr boshida o'qiyotgan o'quvchi yo'q edi");
    expect(text).not.toContain("tasi ketdi");
    expect(text).toContain("Ketguncha o'qidi — ");
  });
  it("loading or no data draws skeletons only", () => {
    const html = renderToStaticMarkup(createElement(DepartedCards, { data: undefined, previousLabel: "", isLoading: true }));
    expect(html).toContain('data-slot="skeleton"');
    expect(norm(html).trim()).toBe("");
  });
});
