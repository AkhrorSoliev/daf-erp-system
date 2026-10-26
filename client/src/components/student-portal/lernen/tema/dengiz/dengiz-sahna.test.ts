import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// The hook reads the device switch in an effect, which a static render never runs.
const kam = vi.hoisted(() => ({ on: false }));
vi.mock("../../harakat/use-kam-harakat", () => ({ useKamHarakat: () => kam.on }));

import { TILE_COPIES } from "../sahna-umumiy";
import { DECOR_GLYPH } from "./dengiz-bezak";
import {
  ELEMENT_BUDGET,
  SCHOOL_FISH,
  SWAY_DECOR,
  WALL_FACTOR,
  dengizPlan,
  stripShapes,
  type DecorKind,
  type DengizPlan,
} from "./dengiz-reja";
import { DengizSahna, DengizSahnaChizma } from "./dengiz-sahna";
import { ZONES, ZONE_IDS } from "./dengiz-zona";

const chiz = (o: { unitTartibi?: number; reduced?: boolean; light?: boolean; tinch?: boolean }) =>
  renderToStaticMarkup(
    createElement(DengizSahnaChizma, {
      unitTartibi: o.unitTartibi ?? 1,
      plan: dengizPlan({ reduced: o.reduced ?? false, light: o.light ?? false }),
      kam: o.reduced ?? false,
      tinch: o.tinch ?? false,
    }),
  );
const tags = (html: string) => (html.match(/<[a-zA-Z]/g) ?? []).length;
const count = (html: string, s: string) => html.split(s).length - 1;

// One test's `kam.on = true` must never leak into the next, whatever order they run in.
afterEach(() => {
  kam.on = false;
});

/** A decoration glyph's own elements: drawn alone inside an `<svg>` that is not counted. */
const glyphTags = (kind: DecorKind) =>
  tags(renderToStaticMarkup(createElement("svg", null, createElement(DECOR_GLYPH[kind], { color: "#000000" })))) - 1;

/**
 * Every element of the scene for a plan, counted from the plan's own numbers and
 * the shapes it draws: the root and the dark-mode veil, then per zone the water,
 * the ridges, two strips (a few fixed elements, the `<use>` copies and each
 * decoration in a `<g>`) and the fronds, then the ambient box, the light shafts,
 * the bubbles and the schools (a `<div>` and five elements a fish).
 */
function expectedTags(plan: DengizPlan): number {
  const ROOT_AND_VEIL = 2;
  const ZONE_BASE = 5; // zone, water, ridge svg + its two paths
  const STRIP_BASE = 4 + (TILE_COPIES - 1); // svg, mirror g, tile g, wall path, the <use> copies
  const AMBIENT_BASE = 2; // the box and the light shafts
  const FISH = 5; // svg, g, two paths, the eye
  let n = ROOT_AND_VEIL + AMBIENT_BASE + plan.bubbles + plan.schools * (1 + SCHOOL_FISH.length * FISH);
  for (const zona of ZONE_IDS) {
    n += ZONE_BASE + plan.sways * (1 + glyphTags(SWAY_DECOR[zona]));
    for (const side of ["left", "right"] as const) {
      n += STRIP_BASE;
      for (const d of stripShapes(zona, side, plan.decor).decor) n += 1 + glyphTags(d.kind);
    }
  }
  return n;
}

describe("<DengizSahnaChizma />", () => {
  it("shows only the unit's zone; the other two wait hidden for the cross-fade", () => {
    const html = chiz({ unitTartibi: 2 });
    expect(html.match(/data-zona="/g)).toHaveLength(3);
    expect(html.match(/data-faol=""/g)).toHaveLength(1);
    expect(html).toMatch(/data-zona="kelp" data-faol=""/);
    expect(chiz({ unitTartibi: 6 })).toMatch(/data-zona="chuqur" data-faol=""/);
  });

  it("never leaves the water blank: exactly one zone is flagged, whatever the unit order", () => {
    for (const n of [0, -4, -1, 1, 1.7, 2, 3, 4, 7, 2.9, Number.NaN, Infinity, -Infinity]) {
      expect(chiz({ unitTartibi: n }).match(/data-faol=""/g), String(n)).toHaveLength(1);
    }
  });

  it("stays within its budget, a fifth of the spec's cap, even in full detail", () => {
    const full = tags(chiz({}));
    expect(full).toBeLessThanOrEqual(ELEMENT_BUDGET);
    expect(tags(chiz({ light: true }))).toBeLessThan(full);
  });

  // The pinned numbers are the real render's (ADR-0133 lists them without the root: 180, 112, 140);
  // `expectedTags` counts the same thing from the plan, so a change to either side shows up here.
  it.each([
    ["full detail", {}, 181],
    ["a weak device", { light: true }, 113],
    ["«Kam harakat»", { reduced: true }, 141],
  ] as const)("counts exactly the elements of %s, and the plan's numbers add up to them", (_name, o, pinned) => {
    const plan = dengizPlan({ reduced: "reduced" in o, light: "light" in o });
    expect(tags(chiz(o))).toBe(pinned);
    expect(expectedTags(plan)).toBe(pinned);
  });

  it("draws the same markup every time, so the server and the browser agree", () => {
    for (const o of [{}, { unitTartibi: 2 }, { unitTartibi: 3 }, { light: true }, { reduced: true }, { tinch: true }]) {
      expect(chiz(o), JSON.stringify(o)).toBe(chiz(o));
    }
  });

  it("points every <use> at a tile that stands in the scene, and no id repeats", () => {
    for (const o of [{}, { light: true }, { reduced: true }]) {
      const html = chiz(o);
      const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size, `${JSON.stringify(o)}: an id repeats`).toBe(ids.length);
      const hrefs = [...html.matchAll(/<use\b[^>]*\shref="#([^"]+)"/g)].map((m) => m[1]);
      expect(hrefs, JSON.stringify(o)).toHaveLength(6 * (TILE_COPIES - 1));
      for (const href of hrefs) expect(ids, `${JSON.stringify(o)}: #${href} has no element`).toContain(href);
    }
  });

  it("moves only the two narrow wall strips of each zone, each one tile drawn four times", () => {
    const html = chiz({});
    expect(count(html, "data-omil=")).toBe(6);
    expect(count(html, `data-omil="${WALL_FACTOR}"`)).toBe(6);
    expect(count(html, "<use ")).toBe(6 * 3);
    expect(html).toContain('href="#dengiz-kelp-right-tile"');
    expect(html).toContain("width:96px;height:calc(100% + 640px)");
  });

  it("gives each zone and side its own tile id, so three zones can stand on one page", () => {
    const html = chiz({});
    for (const zona of ["marjon", "kelp", "chuqur"]) {
      for (const side of ["left", "right"]) expect(count(html, `id="dengiz-${zona}-${side}-tile"`), `${zona} ${side}`).toBe(1);
    }
  });

  it("filters, blurs and blends nothing: no CSS or SVG filter, no backdrop, no blend mode", () => {
    for (const html of [chiz({}), chiz({ light: true }), chiz({ reduced: true })]) {
      expect(html).not.toMatch(/filter/i);
      expect(html).not.toContain("blend");
      expect(html).not.toContain("backdrop-");
    }
  });

  it("draws the water's life by the plan: eight bubbles and two schools, fewer on a weak device, none under «Kam harakat»", () => {
    expect(count(chiz({}), 'class="dengiz-bubble"')).toBe(8);
    expect(count(chiz({}), 'class="dengiz-school"')).toBe(2);
    expect(count(chiz({ light: true }), 'class="dengiz-bubble"')).toBe(4);
    const still = chiz({ reduced: true });
    expect(still).not.toContain("dengiz-bubble");
    expect(still).not.toContain("dengiz-school");
    expect(count(still, 'class="dengiz-rays"')).toBe(1);
  });

  it("sways two fronds in each zone in full detail, none on a weak device", () => {
    expect(count(chiz({}), "dengiz-sway ")).toBe(6);
    expect(chiz({ light: true })).not.toContain("dengiz-sway");
  });

  it("colours the fish by the shown zone", () => {
    expect(chiz({ unitTartibi: 1 })).toContain(`fill="${ZONES.marjon.fish}"`);
    expect(chiz({ unitTartibi: 1 })).not.toContain(`fill="${ZONES.kelp.fish}"`);
    expect(chiz({ unitTartibi: 2 })).toContain(`fill="${ZONES.kelp.fish}"`);
  });

  it("marks its root for the CSS: still under «Kam harakat», held while paused", () => {
    expect(chiz({})).toMatch(/^<div[^>]*data-sahna="dengiz"/);
    expect(chiz({ reduced: true })).toMatch(/^<div[^>]*data-kam-harakat=""/);
    expect(chiz({ tinch: true })).toMatch(/^<div[^>]*data-tinch=""/);
    expect(chiz({})).not.toMatch(/^<div[^>]*data-(?:kam-harakat|tinch)/);
  });

  it("lays one still dark-mode veil over the scene", () => {
    expect(count(chiz({}), "hidden dark:block")).toBe(1);
  });
});

describe("<DengizSahna />", () => {
  // A static render has no device to ask, so it gets the server snapshot: the light scene.
  // (The app never server-renders a scene, see `useYengilRejim`; this pins the safe default.)
  it("draws the light scene from the server snapshot, in the unit's zone", () => {
    kam.on = false;
    const html = renderToStaticMarkup(createElement(DengizSahna, { unitTartibi: 3 }));
    expect(html).toContain('data-sahna="dengiz"');
    expect(html).toMatch(/data-zona="chuqur" data-faol=""/);
    expect(html.match(/data-faol=""/g)).toHaveLength(1);
    expect(html).not.toContain("dengiz-sway");
    expect(count(html, 'class="dengiz-bubble"')).toBe(4);
  });

  it("is a still picture under «Kam harakat»: no bubbles, no fish", () => {
    kam.on = true;
    const html = renderToStaticMarkup(createElement(DengizSahna, { unitTartibi: 1 }));
    expect(html).not.toContain("dengiz-bubble");
    expect(html).not.toContain("dengiz-school");
    expect(html).toMatch(/^<div[^>]*data-kam-harakat=""/);
  });
});
