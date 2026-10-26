import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { temaTop } from "../tema-reyestri";
import { OrmonMukofotFoni } from "./ormon-mukofot-foni";
import { ormonTema } from "./ormon-tema";

// `children` is the third argument (react/no-children-prop); the cast keeps `tsc`
// from asking for it in the props.
const foni = (bayram: boolean) =>
  renderToStaticMarkup(
    createElement(OrmonMukofotFoni, { bayram } as ComponentProps<typeof OrmonMukofotFoni>, "Dars tugadi!"),
  );

/** Every opening `<div …>` tag of the markup, in document order. */
const divTags = (html: string) => html.match(/<div\b[^>]*>/g) ?? [];

describe("<OrmonMukofotFoni />", () => {
  it("is a forest clearing around the reward, drawn in the theme's tokens", () => {
    const html = foni(false);
    expect(html).toContain('data-mukofot="ormon"');
    expect(html).toContain("Dars tugadi!");
    expect(html).toContain("var(--ormon-mukofot-ust)");
    expect(html).toContain("var(--ormon-tepalik)");
  });

  it("turns a slow sunburst only for a celebration", () => {
    expect(foni(true)).toContain("ormon-burst");
    expect(foni(true)).toContain("var(--ormon-mukofot-nur)");
    expect(foni(false)).not.toContain("ormon-burst");
    expect(foni(false)).not.toContain("var(--ormon-mukofot-nur)");
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
      expect(clipped[0]).toContain("absolute inset-0");

      // The element that directly holds the children, and the root, do not clip.
      const holder = /<div\b([^>]*)>Dars tugadi!<\/div>/.exec(html);
      expect(holder, "the children sit directly in one wrapper").not.toBeNull();
      expect(holder?.[1]).not.toContain("overflow");
      expect(divTags(html)[0]).toContain('data-mukofot="ormon"');
      expect(divTags(html)[0]).not.toContain("overflow");

      // The layer comes first, so the content paints over it.
      expect(html.indexOf(clipped[0])).toBeLessThan(html.indexOf("Dars tugadi!"));
    });
  }
});

describe("the «O'rmon» theme", () => {
  it("is in the registry and brings every slot, its scene and card picture included", () => {
    expect(temaTop("ormon")).toBe(ormonTema);
    expect(ormonTema.id).toBe("ormon");
    for (const slot of ["TugunBelgisi", "MukofotFoni", "UnitLavha", "UnitJoyi", "Sahna", "Miniatyura"] as const) {
      expect(ormonTema[slot], slot).toBeTruthy();
    }
  });
});
