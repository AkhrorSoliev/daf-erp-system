import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DARAJA_FONI, YopishqoqUnitLavha } from "./yopishqoq-unit-lavha";

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
    expect(html).toContain("bg-teal-700");
  });
});

// White banner text must hold 4.5:1 on every level colour. The hexes are read from the stylesheet, so a
// token change that breaks the contrast fails here instead of on a student's phone.
describe("DARAJA_FONI contrast", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const hex = (token: string) => {
    const m = css.match(new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})`));
    if (!m) throw new Error(`token --${token} not found in globals.css`);
    return m[1];
  };
  const lum = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const vsWhite = (h: string) => 1.05 / (lum(h) + 0.05);

  it("pins the deep palette stops", () => {
    expect(DARAJA_FONI).toEqual({ A1: "bg-coral-700", A2: "bg-teal-700", B1: "bg-grape-600" });
  });

  it.each([
    ["A1", "coral-700"],
    ["A2", "teal-700"],
    ["B1", "grape-600"],
  ])("%s: white on %s is at least 4.5:1", (daraja, token) => {
    expect(DARAJA_FONI[daraja]).toBe(`bg-${token}`);
    expect(vsWhite(hex(token))).toBeGreaterThanOrEqual(4.5);
  });
});
