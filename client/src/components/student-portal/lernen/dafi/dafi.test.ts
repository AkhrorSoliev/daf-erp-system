import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dafi } from "./dafi";

describe("<Dafi />", () => {
  it("renders the bear head as inline SVG with its state, hidden from screen readers", () => {
    const html = renderToStaticMarkup(createElement(Dafi, { holat: "bayram", olcham: "md" }));
    expect(html).toContain('data-holat="bayram"');
    expect(html).toContain("<svg");
    expect(html).toContain('aria-hidden="true"');
  });
  it("defaults to the calm state", () => {
    expect(renderToStaticMarkup(createElement(Dafi))).toContain('data-holat="tinch"');
  });
});
