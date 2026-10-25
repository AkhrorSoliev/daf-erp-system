import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TozaMukofotFoni } from "./toza-mukofot-foni";
import { TozaUnitLavha } from "./toza-unit-lavha";

describe("<TozaMukofotFoni />", () => {
  it("is a plain coral tint around the reward, whatever the result", () => {
    for (const bayram of [true, false]) {
      // `children` is the third argument (react/no-children-prop); the cast keeps `tsc`, which checks tests too,
      // from asking for it in the props.
      const html = renderToStaticMarkup(
        createElement(TozaMukofotFoni, { bayram } as ComponentProps<typeof TozaMukofotFoni>, "Dars tugadi!"),
      );
      expect(html).toContain("Dars tugadi!");
      expect(html).toContain("bg-coral-500/10");
    }
  });
});

describe("<TozaUnitLavha />", () => {
  const html = renderToStaticMarkup(createElement(TozaUnitLavha, { daraja: "A2", matn: "A2 · Wohnen" }));

  it("is the path's level-coloured banner with the unit's line", () => {
    expect(html).toContain("A2 · Wohnen");
    expect(html).toContain("bg-teal-500");
  });

  it("is read by screen readers (unlike the sticky path banner) and Dafi waves hello", () => {
    expect(html).not.toMatch(/^<div[^>]*aria-hidden/);
    expect(html).toContain('data-holat="salom"');
  });
});
