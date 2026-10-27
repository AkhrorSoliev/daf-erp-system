import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { temaTop } from "../tema-reyestri";
import { DengizMiniatyura, DengizMukofotFoni, dengizTema } from "./dengiz-tema";

// `children` is the third argument (react/no-children-prop); the cast keeps `tsc`
// from asking for it in the props.
const foni = (bayram: boolean) =>
  renderToStaticMarkup(
    createElement(DengizMukofotFoni, { bayram } as ComponentProps<typeof DengizMukofotFoni>, "Dars tugadi!"),
  );

/** Every opening `<div …>` tag of the markup, in document order. */
const divTags = (html: string) => html.match(/<div\b[^>]*>/g) ?? [];

describe("<DengizMukofotFoni />", () => {
  it("is clear shallow water over the sand, drawn in the theme's tokens", () => {
    const html = foni(false);
    expect(html).toContain('data-mukofot="dengiz"');
    expect(html).toContain("Dars tugadi!");
    expect(html).toContain("var(--dengiz-mukofot-ust)");
    expect(html).toContain("var(--dengiz-tepalik)");
  });

  it("turns slow light rays only for a celebration", () => {
    expect(foni(true)).toContain("dengiz-burst");
    expect(foni(true)).toContain("var(--dengiz-mukofot-nur)");
    expect(foni(false)).not.toContain("dengiz-burst");
    expect(foni(false)).not.toContain("var(--dengiz-mukofot-nur)");
  });

  for (const bayram of [false, true]) {
    it(`clips only a decoration layer behind the content, never the content path (bayram=${bayram})`, () => {
      const html = foni(bayram);
      // Dafi's celebration hops lift it above the card; a clip on the root or on
      // the content wrapper would crop its ears at the peaks.
      const clipped = divTags(html).filter((tag) => tag.includes("overflow-hidden"));
      expect(clipped, "exactly one element clips").toHaveLength(1);
      expect(clipped[0]).toContain('aria-hidden="true"');
      expect(clipped[0]).toContain("pointer-events-none");
      const holder = /<div\b([^>]*)>Dars tugadi!<\/div>/.exec(html);
      expect(holder, "the children sit directly in one wrapper").not.toBeNull();
      expect(holder?.[1]).not.toContain("overflow");
      expect(holder?.[1]).toMatch(/class="[^"]*\brelative\b[^"]*"/);
      expect(divTags(html)[0]).toContain('data-mukofot="dengiz"');
      expect(divTags(html)[0]).not.toContain("overflow");
      expect(html.indexOf(clipped[0])).toBeLessThan(html.indexOf("Dars tugadi!"));
    });
  }
});

// One scene per document (ADR-0132): the card picture is its own static SVG and
// never reuses the scene's layers or ids.
describe("<DengizMiniatyura />", () => {
  it("is a still, small picture of its own: no scene layer, no moving part, its own gradient id", () => {
    const html = renderToStaticMarkup(createElement(DengizMiniatyura));
    expect(html).toMatch(/^<svg data-miniatyura="dengiz"[^>]*aria-hidden="true"/);
    expect(html).toContain('id="dengiz-miniatyura-suv"');
    expect(html).not.toContain("data-omil");
    expect(html).not.toContain("<use");
    expect(html).not.toMatch(/dengiz-(?:strip|zone|sway|bubble|school|rays)/);
    expect((html.match(/<[a-zA-Z]/g) ?? []).length).toBeLessThanOrEqual(12);
  });
});

describe("the «Dengiz» theme", () => {
  it("is in the registry and brings every slot, its scene and card picture included", () => {
    expect(temaTop("dengiz")).toBe(dengizTema);
    expect(dengizTema.id).toBe("dengiz");
    for (const slot of ["TugunBelgisi", "MukofotFoni", "UnitLavha", "UnitJoyi", "Sahna", "Miniatyura"] as const) {
      expect(dengizTema[slot], slot).toBeTruthy();
    }
  });
});
