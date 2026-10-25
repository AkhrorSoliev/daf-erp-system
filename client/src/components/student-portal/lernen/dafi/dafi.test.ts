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
  it("server-renders the calm pose: a mouth and every state-only layer hidden", () => {
    const html = renderToStaticMarkup(createElement(Dafi));
    // Neutral mouth (mw=12, mc=12), the rig's first render draws the same path.
    expect(html).toMatch(/<path class="mo"[^>]*d="M88 106 Q100 118 112 106"/);
    for (const cls of ["hL", "hR", "bL", "bR", "fq", "fs", "fst"]) {
      const tag = html.match(new RegExp(`<[a-z]+ [^>]*class="${cls}"[^>]*>`));
      expect(tag, `layer .${cls} is in the markup`).not.toBeNull();
      expect(tag![0], `layer .${cls} starts hidden`).toContain('opacity="0"');
    }
  });
});
