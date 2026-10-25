import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeansChizigi, chiziqFoizi } from "./seans-chizigi";

describe("chiziqFoizi", () => {
  it("is the share of the questions done, in percent", () => {
    expect(chiziqFoizi(3, 12)).toBe(25);
    expect(chiziqFoizi(12, 12)).toBe(100);
  });
  it("never leaves 0–100 and survives an empty session", () => {
    expect(chiziqFoizi(0, 0)).toBe(0);
    expect(chiziqFoizi(5, 4)).toBe(100);
    expect(chiziqFoizi(-1, 4)).toBe(0);
  });
  it("reads a count that is not a finite number as nothing done", () => {
    expect(chiziqFoizi(Number.NaN, 4)).toBe(0);
    expect(chiziqFoizi(2, Number.NaN)).toBe(0);
    expect(chiziqFoizi(Number.POSITIVE_INFINITY, 4)).toBe(0);
    expect(chiziqFoizi(2, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("<SeansChizigi />", () => {
  const html = renderToStaticMarkup(createElement(SeansChizigi, { tugatilgan: 3, jami: 12 }));

  it("fills the bar to the share done", () => {
    expect(html).toContain("width:25%");
  });

  it("tells assistive tech how far the session is", () => {
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="25"');
  });

  it("eases with a small overshoot, and jumps instead under reduced motion or the device switch", () => {
    expect(html).toContain("ease-[cubic-bezier(.3,1.2,.4,1)]");
    expect(html).toContain("motion-reduce:transition-none");
    expect(html).toContain("in-data-[kam-harakat]:transition-none");
  });
});
