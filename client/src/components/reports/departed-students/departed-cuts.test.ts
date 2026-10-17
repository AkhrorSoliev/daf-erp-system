import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DepartedCuts } from "./departed-cuts";
import type { DepartedOverview } from "./departed-types";

const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const noop = () => {};

// Made-up teachers, courses and numbers.
const CUTS: DepartedOverview["cuts"] = {
  teacher: [
    { id: "t1", name: "Aziza Rahimova", departed: 7, atStart: 40, share: 17.5 },
    { id: "t2", name: "Olim Karimov", departed: 3, atStart: 3, share: null },
    { id: "t3", name: "Zafar Qodirov", departed: 2, atStart: 50, share: 4 },
  ],
  course: [{ id: "c1", name: "Nemis tili A1", departed: 9, atStart: 60, share: 15 }],
  group: [],
  branch: [{ id: "b1", name: "Markaz", departed: 9, atStart: 60, share: 15 }],
};
const render = (cut: string, over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(DepartedCuts, { cuts: CUTS, uniqueDeparted: 9, cut, onCutChange: noop, ...over } as never));

describe("DepartedCuts", () => {
  it("the four cut buttons and the table heads", () => {
    const text = norm(render("teacher"));
    expect(text).toContain("Ustoz Kurs Guruh Filial");
    expect(text).toContain("Ketdi Oy boshida Ulushi");
  });
  it("a row: name, departed, at start, share with a comma; share null is a dash", () => {
    const text = norm(render("teacher"));
    expect(text).toContain("Aziza Rahimova 7 40 17,5%");
    expect(text).toContain("Zafar Qodirov 2 50 4%");
    expect(text).toContain("Olim Karimov 3 3 —");
  });
  it("teacher cut: the two footer lines; other cuts: neither", () => {
    const text = norm(render("teacher"));
    expect(text).toContain("Ustoz — o'quvchi ketgan paytdagi ustozi. Ikki ustozli guruh ikkala ustozda sanaladi.");
    expect(text).toContain("Jami (takrorlanmasdan): 9");
    for (const c of ["course", "branch"]) {
      expect(norm(render(c))).not.toContain("Jami (takrorlanmasdan)");
      expect(norm(render(c))).not.toContain("ikkala ustozda");
    }
  });
  it("the chosen cut is pressed; the first column is named after it", () => {
    const html = render("course");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(norm(html)).toContain("Kurs Ketdi Oy boshida Ulushi");
    expect(norm(html)).toContain("Nemis tili A1 9 60 15%");
  });
  it("a cut without rows says so, with no table", () => {
    const html = render("group");
    expect(norm(html)).toContain("Bu davrda ketgan o'quvchi yo'q");
    expect(html).not.toContain("<table");
  });
  it("never repeats the false «kursni tugatish» sentence", () => {
    expect(norm(render("teacher"))).not.toContain("kursni tugatish");
  });
  it("loading draws a skeleton", () => {
    expect(renderToStaticMarkup(createElement(DepartedCuts, { cuts: undefined, uniqueDeparted: 0, cut: "teacher", onCutChange: noop, isLoading: true } as never))).toContain('data-slot="skeleton"');
  });
});
