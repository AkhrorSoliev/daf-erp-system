import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TemaRasmi } from "./lernen-tema-rasmi";

const render = (id: Parameters<typeof TemaRasmi>[0]["id"], swatch = "#ff6b4a") =>
  renderToStaticMarkup(createElement(TemaRasmi, { id, swatch }));

describe("TemaRasmi (a look's picture on its card)", () => {
  it("draws the theme's own miniature when it has one", () => {
    const html = render("ormon");
    expect(html).toContain('data-miniatyura="ormon"');
    expect(html).not.toContain("background:#ff6b4a");
  });

  it("falls back to the colour dot for a look without a miniature", () => {
    const toza = render("toza");
    expect(toza).toContain("background:#ff6b4a");
    expect(toza).not.toContain("data-miniatyura");
    // A look that is not built yet resolves to Toza in the registry and shows its own dot.
    const dengiz = render("dengiz", "#0ea5e9");
    expect(dengiz).toContain("background:#0ea5e9");
    expect(dengiz).not.toContain("data-miniatyura");
  });

  it("is decorative and every card's picture takes the same cell", () => {
    for (const id of ["toza", "ormon", "dengiz"] as const) {
      const html = render(id);
      expect(html).toMatch(/^<span aria-hidden="true" class="flex h-10 w-14 shrink-0 items-center justify-center">/);
    }
  });
});
