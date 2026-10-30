import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RAIL_WIDTH, type SidebarMode } from "../../lib/sidebar-store";
import { PastkiPanel } from "./pastki-panel";

/** `{ md: 72, lg: 240 }` from a fragment such as "md:w-[72px] lg:w-[240px]". */
function pxByBreakpoint(classes: string, utility: "w" | "pl"): Record<string, number> {
  const pattern = new RegExp(`(?:^|\\s)(\\w+):${utility}-\\[(\\d+)px\\]`, "g");
  const found: Record<string, number> = {};
  for (const [, breakpoint, px] of classes.matchAll(pattern)) {
    found[breakpoint] = Number(px);
  }
  return found;
}

/** Classes of the bar's outermost (the `fixed`) element. */
function barClasses(sidebarMode: SidebarMode | null): string {
  const html = renderToStaticMarkup(
    createElement(PastkiPanel, { sidebarMode }, "Tekshirish"),
  );
  return html.match(/^<div class="([^"]*)"/)?.[1] ?? "";
}

// The bar is `fixed`, so nothing in the page flow keeps it clear of the side
// rail: centred on the whole viewport, it slid under the rail from md up and
// hid «Xato» and the start of the answer (seen 2026-09-27 at 800px on
// /portal/lernen/wiederholung). It has to start where the rail ends.
describe("lesson bottom bar beside the side rail", () => {
  it.each(["auto", "collapsed", "expanded"] as const)(
    "starts where the %s rail ends, at every breakpoint",
    (mode) => {
      const rail = pxByBreakpoint(RAIL_WIDTH[mode], "w");
      expect(Object.keys(rail).length).toBeGreaterThan(0);
      expect(pxByBreakpoint(barClasses(mode), "pl")).toEqual(rail);
    },
  );

  it("keeps the full width on a phone, where there is no rail", () => {
    const classes = barClasses("expanded").split(/\s+/);
    expect(classes).toContain("inset-x-0");
    expect(classes.filter((c) => /^(pl|left|ml|inset)-/.test(c))).toEqual([
      "inset-x-0",
    ]);
  });

  it("null rejimida chekinish klassi yo'q", () => {
    expect(barClasses(null)).not.toMatch(/:pl-/);
  });
});

/** Classes of the painted inner layer. */
function innerClasses(ohang?: "togri" | "xato" | null): string {
  const html = renderToStaticMarkup(
    createElement(PastkiPanel, { sidebarMode: "auto", ohang }, "Tekshirish"),
  );
  return html.match(/^<div class="[^"]*"><div class="([^"]*)"/)?.[1] ?? "";
}

describe("the bar's tint after a check (ADR-0128)", () => {
  it("is the plain surface before the check", () => {
    expect(innerClasses()).toContain("bg-surface");
    expect(innerClasses(null)).toContain("bg-surface");
  });

  it("is a soft green after a right answer", () => {
    expect(innerClasses("togri")).toContain("var(--success)");
  });

  it("is the soft amber after a miss, never red", () => {
    const c = innerClasses("xato");
    expect(c).toContain("var(--amber-500)");
    expect(c).not.toContain("danger");
  });

  it("stops fading under reduced motion and the device switch", () => {
    expect(innerClasses("xato")).toContain("motion-reduce:transition-none");
    expect(innerClasses("xato")).toContain("in-data-[kam-harakat]:transition-none");
  });
});
