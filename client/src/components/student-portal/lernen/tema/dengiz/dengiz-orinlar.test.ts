import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TugunBelgisiProps, UnitJoyiProps } from "../tema-turlari";
import { CARD_SURFACE_ALPHA } from "../sahna-umumiy";
import { DengizJoy, JOY_BELGISI, placeForKind } from "./dengiz-joy";
import { DengizTugun } from "./dengiz-tugun";
import { DengizUnitLavha } from "./dengiz-unit-lavha";
import { ACCENT, DEPTH_CHIP_ALPHA, ZONES } from "./dengiz-zona";

const tugun = (p: Partial<TugunBelgisiProps>) =>
  renderToStaticMarkup(
    createElement(DengizTugun, { label: "Tanishuv", holat: "active", tone: "coral", onClick: () => {}, ...p }),
  );

const joy = (p: Partial<UnitJoyiProps>) =>
  renderToStaticMarkup(
    createElement(DengizJoy, {
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

describe("<DengizTugun />", () => {
  it("the current node is the gold orb with a ring, pressable and named by its section", () => {
    const html = tugun({});
    expect(html).toContain('data-tugun="dengiz"');
    expect(html).toContain('aria-label="Tanishuv"');
    expect(html).toContain("dengiz-ring");
    expect(html).toContain("#ffbe55");
    expect(html).not.toContain("aria-disabled");
  });

  it("a finished node is the pearl, whatever the level colour", () => {
    expect(tugun({ holat: "done", tone: "teal" })).toBe(tugun({ holat: "done", tone: "grape" }));
    expect(tugun({ holat: "done" })).toContain("#d9b8fb");
  });

  it("a locked node stays pressable (it plays the locked sound) but says it is closed", () => {
    const html = tugun({ holat: "locked", onClick: undefined, onBosilmagan: () => {} });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-label="Tanishuv — hali ochilmagan"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled/);
    expect(html).not.toContain("dengiz-ring");
  });

  it("writes its name on a positioned plain surface pill in the darkest ink", () => {
    expect(tugun({})).toMatch(/<span class="[^"]*\brelative\b[^"]*\bbg-surface\b[^"]*\btext-ink-900\b[^"]*">Tanishuv</);
    expect(tugun({})).not.toContain("backdrop-");
  });
});

describe("placeForKind (spec §8)", () => {
  it("is a shell house, a ship, a cave and the treasure along the unit; an old lesson is the shell house", () => {
    expect(placeForKind("SECTION_A")).toBe("chiganoq");
    expect(placeForKind("SECTION_B")).toBe("kema");
    expect(placeForKind("BRIDGE")).toBe("gor");
    expect(placeForKind("UNIT_TEST")).toBe("xazina");
    expect(placeForKind(null)).toBe("chiganoq");
  });

  // The client and the server are deployed by hand, so the server can send a kind
  // this build does not know. The page must still draw a place, not throw.
  it("draws an unknown kind as the shell house, a place that has an emblem", () => {
    const unknown = "FUTURE_KIND" as unknown as Parameters<typeof placeForKind>[0];
    expect(placeForKind(unknown)).toBe("chiganoq");
    expect(JOY_BELGISI[placeForKind(unknown)]).toBeTypeOf("function");
    expect(joy({ kind: unknown })).toContain('data-joy="chiganoq"');
  });

  it("gives every place a small, still emblem", () => {
    for (const Belgi of Object.values(JOY_BELGISI)) {
      const html = renderToStaticMarkup(createElement(Belgi, {}));
      expect(html).toMatch(/^<svg[^>]*aria-hidden="true"/);
      expect((html.match(/<[a-zA-Z]/g) ?? []).length).toBeLessThanOrEqual(10);
    }
  });
});

describe("<DengizJoy />", () => {
  it("draws the lesson as its place under the sea", () => {
    expect(joy({ kind: "SECTION_B" })).toContain('data-joy="kema"');
    expect(joy({ kind: "BRIDGE" })).toContain('data-joy="gor"');
    expect(joy({ kind: "UNIT_TEST" })).toContain('data-joy="xazina"');
  });

  it("offers «Boshlash» on the deep sea blue only on the current place, and its emblem bobs", () => {
    const html = joy({});
    expect(html).toContain(`style="background:${ACCENT}">Boshlash<`);
    expect(html).toContain("dengiz-bob");
    expect(joy({ holat: "done" })).not.toContain("Boshlash");
  });

  it("keeps a locked place pressable for the locked sound, tells it is closed, and leaves it in the murk", () => {
    const html = joy({ holat: "locked" });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-label="Tanishuv — hali ochilmagan"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled/);
    expect(html).toContain("data-tuman");
    expect(html).toContain("rgba(14, 34, 80, 0.7)");
    expect(joy({})).not.toContain("data-tuman");
  });

  it("alternates sides down the page and keeps the name clear of the corner badge", () => {
    expect(joy({ tartib: 1 })).toContain("flex-row-reverse");
    expect(joy({ tartib: 2 })).not.toContain("flex-row-reverse");
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

describe("<DengizUnitLavha />", () => {
  const html = (unitTartibi?: number) =>
    renderToStaticMarkup(createElement(DengizUnitLavha, { daraja: "A1", matn: "A1 · Zahlen", unitTartibi }));

  it("is the unit's zone banner with its line, its depth and Dafi waving hello", () => {
    const h = html(2);
    expect(h).toContain("A1 · Zahlen");
    expect(h).toContain('data-lavha-zona="kelp"');
    expect(h).toContain(`background:${ZONES.kelp.banner}`);
    expect(h).toContain('data-holat="salom"');
    expect(h).toContain(`background:rgba(0, 0, 0, ${DEPTH_CHIP_ALPHA})`);
    // The depth is decoration: shown, not read out.
    expect(h).toMatch(/<span aria-hidden="true"[^>]*>25 m<\/span>/);
  });

  it("is the reef when the order is not given, and screen readers read it", () => {
    expect(html()).toContain('data-lavha-zona="marjon"');
    expect(html()).toMatch(/>5 m<\/span>/);
    expect(html(3)).toMatch(/>70 m<\/span>/);
    expect(html()).not.toMatch(/^<div[^>]*aria-hidden/);
  });
});
