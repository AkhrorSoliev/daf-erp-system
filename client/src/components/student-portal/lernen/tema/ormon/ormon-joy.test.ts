import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UnitJoyiProps } from "../tema-turlari";
import { ACCENT, BIOMES, CARD_SURFACE_ALPHA } from "./ormon-biom";
import { JOY_BELGISI, placeForKind } from "./ormon-joy-belgilari";
import { OrmonJoy } from "./ormon-joy";
import { OrmonUnitLavha } from "./ormon-unit-lavha";

const joy = (p: Partial<UnitJoyiProps>) =>
  renderToStaticMarkup(
    createElement(OrmonJoy, {
      label: "Tanishuv",
      kind: "SECTION_A",
      holat: "active",
      tone: "coral",
      izoh: null,
      tartib: 0,
      onClick: () => {},
      onBosilmagan: () => {},
      ...p,
    }),
  );

describe("placeForKind (spec §8)", () => {
  it("is a hut, a bridge, a cave and a castle along the unit; an old lesson is a hut", () => {
    expect(placeForKind("SECTION_A")).toBe("kulba");
    expect(placeForKind("SECTION_B")).toBe("koprik");
    expect(placeForKind("BRIDGE")).toBe("gor");
    expect(placeForKind("UNIT_TEST")).toBe("qala");
    expect(placeForKind(null)).toBe("kulba");
  });

  // The client and the server are deployed by hand, so the server can send a kind
  // this build does not know. The page must still draw a place, not throw.
  it("draws an unknown kind as a hut, a place that has an emblem", () => {
    const unknown = "FUTURE_KIND" as unknown as Parameters<typeof placeForKind>[0];
    expect(placeForKind(unknown)).toBe("kulba");
    expect(JOY_BELGISI[placeForKind(unknown)]).toBeTypeOf("function");
    expect(joy({ kind: unknown })).toContain('data-joy="kulba"');
  });

  it("gives every place a small, still emblem", () => {
    for (const Belgi of Object.values(JOY_BELGISI)) {
      const html = renderToStaticMarkup(createElement(Belgi, {}));
      expect(html).toMatch(/^<svg[^>]*aria-hidden="true"/);
      expect((html.match(/<[a-zA-Z]/g) ?? []).length).toBeLessThanOrEqual(10);
    }
  });
});

describe("<OrmonJoy />", () => {
  it("draws the lesson as its place in the forest", () => {
    expect(joy({ kind: "BRIDGE" })).toContain('data-joy="gor"');
    expect(joy({ kind: "UNIT_TEST" })).toContain('data-joy="qala"');
  });

  it("offers «Boshlash» on the accent only on the current place, and its emblem breathes", () => {
    const html = joy({});
    expect(html).toContain(`style="background:${ACCENT}">Boshlash<`);
    expect(html).toContain("ormon-bob");
    expect(joy({ holat: "done" })).not.toContain("Boshlash");
  });

  it("keeps a locked place pressable for the locked sound, tells it is closed, and covers it in fog", () => {
    const html = joy({ holat: "locked" });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-label="Tanishuv — hali ochilmagan"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled/);
    expect(html).toContain("data-tuman");
    expect(joy({})).not.toContain("data-tuman");
  });

  it("alternates sides down the page", () => {
    expect(joy({ tartib: 1 })).toContain("flex-row-reverse");
    expect(joy({ tartib: 2 })).not.toContain("flex-row-reverse");
  });

  it("keeps the name clear of the corner badge on whichever side the badge is", () => {
    expect(joy({ tartib: 0 })).toMatch(/class="[^"]*\bpr-6\b[^"]*">Tanishuv</);
    expect(joy({ tartib: 1 })).toMatch(/class="[^"]*\bpl-6\b[^"]*">Tanishuv</);
  });

  it("sits on the surface at the share the contrast test measures, with no backdrop blur, and writes only readable inks", () => {
    const html = joy({ holat: "done", izoh: "Yana mashq qilish · 14 yangi so'z" });
    expect(html).toContain(`bg-surface/${Math.round(CARD_SURFACE_ALPHA * 100)}`);
    expect(html).not.toContain("backdrop-");
    expect(html).not.toMatch(/\btext-(?:ink-500|ink-400|success|coral-600)\b/);
    expect(html).toMatch(/text-\[var\(--amber-ink\)\][^>]*>Yana mashq qilish/);
  });
});

describe("<OrmonUnitLavha />", () => {
  const html = (unitTartibi?: number) =>
    renderToStaticMarkup(createElement(OrmonUnitLavha, { daraja: "A1", matn: "A1 · Zahlen", unitTartibi }));

  it("is the unit's biome banner with its line and Dafi waving hello", () => {
    const h = html(2);
    expect(h).toContain("A1 · Zahlen");
    expect(h).toContain('data-lavha-biom="kol"');
    expect(h).toContain(`background:${BIOMES.kol.near}`);
    expect(h).toContain('data-holat="salom"');
  });

  it("is the dawn when the order is not given, and screen readers read it", () => {
    expect(html()).toContain('data-lavha-biom="tong"');
    expect(html()).not.toMatch(/^<div[^>]*aria-hidden/);
  });
});
