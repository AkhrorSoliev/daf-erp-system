import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { YopishqoqUnitLavha } from "./yopishqoq-unit-lavha";

describe("YopishqoqUnitLavha", () => {
  const html = renderToStaticMarkup(createElement(YopishqoqUnitLavha, { matn: "1-unit", daraja: "A2" }));

  it("turns the colour crossfade off under reduced motion", () => {
    expect(html).toContain("motion-reduce:transition-none");
  });

  it("still draws the text and the level colour", () => {
    expect(html).toContain("1-unit");
    expect(html).toContain("bg-teal-500");
  });
});
