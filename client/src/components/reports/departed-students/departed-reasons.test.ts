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
