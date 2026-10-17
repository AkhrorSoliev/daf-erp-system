import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DepartedReasons } from "./departed-reasons";

const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const noop = () => {};
const REASONS = [
  { reasonId: null, name: "Sabab yozilmagan", count: 4 },
  { reasonId: "r1", name: "Boshqa sabab", count: 8 },
  { reasonId: "r2", name: "Narx qimmat", count: 2 },
];
const render = (reasons: typeof REASONS | undefined, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(DepartedReasons, { reasons, onReadComments: noop, ...extra } as never));

describe("DepartedReasons", () => {
  it("the biggest bar is full width, «Sabab yozilmagan» goes last", () => {
    const html = render(REASONS);
    const text = norm(html);
    expect(text).toContain("Boshqa sabab 8 «Boshqa sabab» izohlarini o'qish Narx qimmat 2 Sabab yozilmagan 4");
    expect(html).toContain("width:100%");
    expect(html).toContain("width:25%");
    expect(text).toContain("Chetlatilgan o'quvchining sababi uning kartasidan olinadi.");
    expect(text).not.toContain("kursni tugatish");
  });
  it("rows sort by count, biggest first; the unwritten reason stays last", () => {
    const text = norm(render([
      { reasonId: null, name: "Sabab yozilmagan", count: 9 },
      { reasonId: "r2", name: "Narx qimmat", count: 2 },
      { reasonId: "r3", name: "Vaqt to'g'ri kelmagan", count: 7 },
      { reasonId: "r4", name: "Filial almashdi", count: 7 },
    ]));
    expect(text.indexOf("Vaqt to'g'ri kelmagan 7")).toBeLessThan(text.indexOf("Filial almashdi 7"));
    expect(text.indexOf("Filial almashdi 7")).toBeLessThan(text.indexOf("Narx qimmat 2"));
    expect(text.indexOf("Narx qimmat 2")).toBeLessThan(text.indexOf("Sabab yozilmagan 9"));
  });
  it("a long reason name carries a title; the comments button is type=button", () => {
    const html = render(REASONS);
    expect(html).toContain('title="Narx qimmat"');
    expect(html).toContain('type="button"');
  });
  it("the comments button only under «Boshqa sabab»", () => {
    const html = render(REASONS);
    expect(html.match(/izohlarini o&#x27;qish/g)).toHaveLength(1);
    expect(norm(html)).toContain("«Boshqa sabab» izohlarini o'qish");
  });
  it("no «Boshqa sabab» row: no button", () => {
    expect(norm(render([REASONS[2]]))).not.toContain("izohlarini");
  });
  it("empty list says so", () => {
    expect(norm(render([]))).toContain("Bu davrda ketgan o'quvchi yo'q");
  });
  it("loading draws skeletons", () => {
    expect(render(undefined, { isLoading: true })).toContain('data-slot="skeleton"');
  });
});
