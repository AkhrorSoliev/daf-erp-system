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

describe("<OrmonMukofotFoni />", () => {
  it("is a forest clearing around the reward, drawn in the theme's tokens", () => {
    const html = foni(false);
    expect(html).toContain("Dars tugadi!");
    expect(html).toContain("var(--ormon-mukofot-ust)");
    expect(html).toContain("var(--ormon-tepalik)");
  });

  it("turns a slow sunburst only for a celebration", () => {
    expect(foni(true)).toContain("ormon-burst");
    expect(foni(false)).not.toContain("ormon-burst");
  });
});

describe("the «O'rmon» theme", () => {
  it("is in the registry and brings every slot, its own scene included", () => {
    expect(temaTop("ormon")).toBe(ormonTema);
    for (const slot of ["TugunBelgisi", "MukofotFoni", "UnitLavha", "UnitJoyi", "Sahna"] as const) {
      expect(ormonTema[slot], slot).toBeTruthy();
    }
  });
});
