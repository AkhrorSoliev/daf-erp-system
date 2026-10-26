import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RAIL_WIDTH, type SidebarMode } from "../../lib/sidebar-store";
import { SAHNA_KARTASI, SAHNA_PARDASI, SAHNA_PARDASI_KICHIK, SahnaRamka } from "./sahna-ramka";

/** `{ md: 72, lg: 240 }` from a fragment such as "md:w-[72px] lg:w-[240px]". */
function pxByBreakpoint(classes: string, utility: "w" | "pl"): Record<string, number> {
  const found: Record<string, number> = {};
  for (const [, breakpoint, px] of classes.matchAll(new RegExp(`(?:^|\\s)(\\w+):${utility}-\\[(\\d+)px\\]`, "g"))) {
    found[breakpoint] = Number(px);
  }
  return found;
}

// `children` is the third argument (react/no-children-prop).
const ramka = (sidebarMode: SidebarMode) =>
  renderToStaticMarkup(createElement(SahnaRamka, { sidebarMode } as ComponentProps<typeof SahnaRamka>, "sahna"));
const rootClasses = (html: string) => html.match(/^<div[^>]*\sclass="([^"]*)"/)?.[1] ?? "";

// The frame is `fixed`, so nothing in the page flow keeps it clear of the side
// rail; the rail is glass, and a scene under it would show through.
describe("SahnaRamka", () => {
  it.each(["auto", "collapsed", "expanded"] as const)("starts where the %s rail ends, at every breakpoint", (mode) => {
    const rail = pxByBreakpoint(RAIL_WIDTH[mode], "w");
    expect(Object.keys(rail).length).toBeGreaterThan(0);
    expect(pxByBreakpoint(rootClasses(ramka(mode)), "pl")).toEqual(rail);
  });

  it("covers the screen behind the content and never takes a tap or a screen reader", () => {
    const html = ramka("auto");
    const classes = rootClasses(html).split(/\s+/);
    for (const c of ["fixed", "inset-0", "-z-10", "pointer-events-none"]) expect(classes).toContain(c);
    expect(html).toMatch(/^<div aria-hidden="true"/);
    expect(html).toContain("sahna");
  });

  // The rail and the content column slide over 200 ms when the rail is toggled;
  // the frame's inset must follow at the same pace, or the scene sits under the
  // rail (or leaves a gap beside it) for a moment.
  it("follows the rail's width change at the pace of the content column, and at once under reduced motion", () => {
    const classes = rootClasses(ramka("expanded")).split(/\s+/);
    for (const c of ["transition-[padding]", "duration-200", "ease-out", "motion-reduce:transition-none"]) {
      expect(classes).toContain(c);
    }
    const shell = readFileSync(join(__dirname, "../../student-portal-layout.tsx"), "utf8");
    expect(shell).toContain('"transition-[padding] duration-200 ease-out"');
  });
});

describe("the plates for text on a scene", () => {
  it("are the plain, opaque surface with no backdrop blur", () => {
    for (const plate of [SAHNA_PARDASI, SAHNA_PARDASI_KICHIK, SAHNA_KARTASI]) {
      expect(plate.split(" ")).toContain("bg-surface");
      expect(plate).not.toContain("backdrop-");
    }
  });
});
