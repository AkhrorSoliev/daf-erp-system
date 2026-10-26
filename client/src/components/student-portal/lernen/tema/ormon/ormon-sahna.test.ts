import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The hook reads the device switch in an effect, which a static render never runs.
const kam = vi.hoisted(() => ({ on: false }));
vi.mock("../../harakat/use-kam-harakat", () => ({ useKamHarakat: () => kam.on }));

import { OrmonSahna, OrmonSahnaChizma } from "./ormon-sahna";
import { ELEMENT_BUDGET, scenePlan } from "./ormon-sahna-rejasi";

const chiz = (o: { unitTartibi?: number; reduced?: boolean; light?: boolean; tinch?: boolean }) =>
  renderToStaticMarkup(
    createElement(OrmonSahnaChizma, {
      unitTartibi: o.unitTartibi ?? 1,
      plan: scenePlan({ reduced: o.reduced ?? false, light: o.light ?? false }),
      kam: o.reduced ?? false,
      tinch: o.tinch ?? false,
    }),
  );
const tags = (html: string) => (html.match(/<[a-zA-Z]/g) ?? []).length;

describe("<OrmonSahnaChizma />", () => {
  it("shows only the unit's biome; the other two wait hidden for the cross-fade", () => {
    const html = chiz({ unitTartibi: 2 });
    expect(html.match(/data-biom="/g)).toHaveLength(3);
    expect(html.match(/data-faol=""/g)).toHaveLength(1);
    expect(html).toMatch(/data-biom="kol" data-faol=""/);
    expect(chiz({ unitTartibi: 6 })).toMatch(/data-biom="kuz" data-faol=""/);
  });

  it("never leaves the scene blank: exactly one biome is flagged, whatever the unit order", () => {
    for (const n of [0, -4, 1, 2, 3, 4, 7, 2.9, Number.NaN, Infinity]) {
      expect(chiz({ unitTartibi: n }).match(/data-faol=""/g), String(n)).toHaveLength(1);
    }
  });

  it("stays within the element budget even in full detail (spec §11)", () => {
    const full = tags(chiz({}));
    expect(full).toBeLessThanOrEqual(ELEMENT_BUDGET);
    expect(tags(chiz({ light: true }))).toBeLessThan(full);
  });

  it("drops the far layer on a weak device", () => {
    expect(chiz({})).toContain('id="ormon-tong-far-tile"');
    expect(chiz({ light: true })).not.toContain("-far-tile");
  });

  it("marks its root for the CSS: still under «Kam harakat», held while paused", () => {
    expect(chiz({ reduced: true })).toMatch(/^<div[^>]*data-kam-harakat=""/);
    expect(chiz({ tinch: true })).toMatch(/^<div[^>]*data-tinch=""/);
    expect(chiz({})).not.toMatch(/^<div[^>]*data-(?:kam-harakat|tinch)/);
  });

  it("lays one still dark-mode veil over the scene, and nothing in it takes a backdrop blur", () => {
    const html = chiz({});
    expect(html).toContain("hidden dark:block");
    expect(html).not.toContain("backdrop-");
  });
});

describe("<OrmonSahna />", () => {
  // A static render has no device to ask, so it gets the server snapshot: the light scene.
  // (The app never server-renders a scene, see `useYengilRejim`; this pins the safe default.)
  it("draws the light scene from the server snapshot, in the unit's biome", () => {
    kam.on = false;
    const html = renderToStaticMarkup(createElement(OrmonSahna, { unitTartibi: 3 }));
    expect(html).toContain('data-sahna="ormon"');
    expect(html).toMatch(/data-biom="kuz" data-faol=""/);
    expect(html.match(/data-faol=""/g)).toHaveLength(1);
    expect(html).not.toContain("-far-tile");
  });

  it("is a still picture under «Kam harakat»: no fireflies, no falling leaves", () => {
    kam.on = true;
    const html = renderToStaticMarkup(createElement(OrmonSahna, { unitTartibi: 1 }));
    expect(html).not.toContain("ormon-spark");
    expect(html).not.toContain("ormon-leaf");
    kam.on = false;
  });
});
