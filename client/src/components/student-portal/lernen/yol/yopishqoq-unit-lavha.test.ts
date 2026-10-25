import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { YopishqoqUnitLavha } from "./yopishqoq-unit-lavha";

describe("YopishqoqUnitLavha", () => {
  const html = renderToStaticMarkup(createElement(YopishqoqUnitLavha, { matn: "1-unit", daraja: "A2" }));

  it("turns the colour crossfade off under reduced motion", () => {
    expect(html).toContain("motion-reduce:transition-none");
  });

  it("is hidden from screen readers (it repeats the unit headers) and findable for the auto-scroll", () => {
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("aria-live");
    expect(html).toContain("data-yol-banner");
  });

  it("stays clear of a notch", () => {
    expect(html).toContain("top-[max(0.5rem,env(safe-area-inset-top))]");
  });

  it("drops the colour crossfade under the device's less-motion switch too", () => {
    expect(html).toContain("in-data-[kam-harakat]:transition-none");
  });

  it("still draws the text and the level colour", () => {
    expect(html).toContain("1-unit");
    expect(html).toContain("bg-teal-500");
  });
});
