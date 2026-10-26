import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrmonAmbient } from "./ormon-ambient";
import { scenePlan } from "./ormon-sahna-rejasi";

const draw = (reduced: boolean, light: boolean) =>
  renderToStaticMarkup(createElement(OrmonAmbient, { plan: scenePlan({ reduced, light }), glow: "#fff1c4" }));
const count = (html: string, cls: string) => (html.match(new RegExp(`class="${cls}"`, "g")) ?? []).length;

describe("<OrmonAmbient />", () => {
  it("draws the plan's light: shafts, mist, fireflies and leaves, in the biome's glow", () => {
    const html = draw(false, false);
    expect(count(html, "ormon-rays")).toBe(1);
    expect(count(html, "ormon-mist")).toBe(2);
    expect(count(html, "ormon-spark")).toBe(4);
    expect(count(html, "ormon-leaf")).toBe(2);
    expect(html).toContain("--ormon-glow:#fff1c4");
  });

  it("halves the moving decor on a weak device", () => {
    const html = draw(false, true);
    expect(count(html, "ormon-spark")).toBe(2);
    expect(count(html, "ormon-leaf")).toBe(1);
    expect(count(html, "ormon-mist")).toBe(1);
  });

  it("draws no fireflies and no falling leaves under «Kam harakat»", () => {
    const html = draw(true, false);
    expect(count(html, "ormon-spark")).toBe(0);
    expect(count(html, "ormon-leaf")).toBe(0);
    expect(count(html, "ormon-rays")).toBe(1);
  });
});
