import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TugunHolat } from "./tema-turlari";
import { type JoyKorinishi, SahnaJoy, SahnaMukofotFoni, type SharRangi, SharTugun } from "./sahna-qismlari";
import { CARD_SURFACE_ALPHA, TILE, TILE_COPIES, joyTanla, seededRandom, unitCycleIndex } from "./sahna-umumiy";

describe("unitCycleIndex (spec §5 palitraUnitga, shared by every scene)", () => {
  it("walks the stages by the unit's order in its level and starts over", () => {
    expect([1, 2, 3, 4, 5, 6, 12].map((n) => unitCycleIndex(n, 3))).toEqual([0, 1, 2, 0, 1, 2, 2]);
    expect([1, 2, 3, 4, 5].map((n) => unitCycleIndex(n, 4))).toEqual([0, 1, 2, 3, 0]);
  });

  it("gives an exact stage for an order the data should never hold", () => {
    expect(unitCycleIndex(0, 3)).toBe(2);
    expect(unitCycleIndex(-1, 3)).toBe(1);
    expect(unitCycleIndex(-5, 3)).toBe(0);
    expect(unitCycleIndex(1.7, 3)).toBe(0);
    expect(unitCycleIndex(Number.NaN, 3)).toBe(0);
    expect(unitCycleIndex(Number.POSITIVE_INFINITY, 3)).toBe(0);
  });
});

describe("seededRandom", () => {
  it("gives the same numbers in [0, 1) for the same seed, so the server and the browser draw the same scene", () => {
    const a = seededRandom(5);
    const b = seededRandom(5);
    const xs = Array.from({ length: 20 }, () => a());
    expect(Array.from({ length: 20 }, () => b())).toEqual(xs);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("the wrapping tile", () => {
  it("covers a viewport up to 1920 px tall: the copies reach the viewport plus one tile", () => {
    expect((TILE_COPIES - 1) * TILE).toBeGreaterThanOrEqual(1920);
  });
});

describe("joyTanla", () => {
  const JOYLAR = { SECTION_A: "a", SECTION_B: "b", BRIDGE: "c", UNIT_TEST: "d" } as const;

  it("names each step's place; an old DiB lesson is the first meeting's place", () => {
    expect(joyTanla("SECTION_A", JOYLAR)).toBe("a");
    expect(joyTanla("SECTION_B", JOYLAR)).toBe("b");
    expect(joyTanla("BRIDGE", JOYLAR)).toBe("c");
    expect(joyTanla("UNIT_TEST", JOYLAR)).toBe("d");
    expect(joyTanla(null, JOYLAR)).toBe("a");
  });

  // The client and the server are deployed by hand: the server can send a kind
  // this build does not know. The page must still draw a place, never throw.
  it("draws a kind this build does not know as the first meeting's place, even one named like an object key", () => {
    for (const k of ["FUTURE_KIND", "constructor", "toString", "__proto__", ""]) {
      expect(joyTanla(k as unknown as Parameters<typeof joyTanla>[0], JOYLAR), k).toBe("a");
    }
  });
});

describe("the shared parts take the theme's id for their classes and tokens", () => {
  const noop = () => {};
  const SHAR: Record<TugunHolat, SharRangi> = {
    done: { fon: "#fff6d4", soya: "none", belgi: "#6b4a10" },
    active: { fon: "#86ead2", soya: "none", belgi: "#0d4a3d" },
    locked: { fon: "#ffffff", soya: "none", belgi: "#45616f" },
  };
  const tugun = (holat: TugunHolat) =>
    renderToStaticMarkup(
      createElement(SharTugun, {
        tema: "dengiz",
        shar: SHAR,
        halqa: "0 0 0 10px red",
        label: "Tanishuv",
        holat,
        tone: "coral",
        onClick: noop,
        onBosilmagan: noop,
      }),
    );

  it("SharTugun: the theme's node and ring; a locked node stays a button that says it is closed", () => {
    const html = tugun("active");
    expect(html).toContain('data-tugun="dengiz"');
    expect(html).toContain('class="dengiz-ring absolute inset-0 rounded-full"');
    expect(html).toContain("box-shadow:0 0 0 10px red");
    const locked = tugun("locked");
    expect(locked).toContain('aria-label="Tanishuv — hali ochilmagan"');
    expect(locked).toContain('aria-disabled="true"');
    expect(locked).not.toMatch(/<button[^>]*\sdisabled/);
    expect(locked).not.toContain("dengiz-ring");
  });

  const KORINISH: JoyKorinishi = {
    nur: { done: "gold", active: "mint", locked: "white" },
    nishon: {
      done: { fon: "#f2cd7a", rang: "#5a3d10" },
      active: { fon: "#86ead2", rang: "#0d4a3d" },
      locked: { fon: "var(--bg-sunk)", rang: "var(--ink-600)" },
    },
    tuman: "navy",
    accent: "#0b5f86",
    faolNur: "0 0 40px gold",
  };
  const Belgi = ({ className }: { className?: string }) => createElement("svg", { className, "aria-hidden": "true" });
  const joy = (holat: TugunHolat, tartib = 0) =>
    renderToStaticMarkup(
      createElement(SahnaJoy, {
        tema: "dengiz",
        joy: "kema",
        Belgi,
        korinish: KORINISH,
        label: "Ishlatish",
        kind: "SECTION_B",
        holat,
        tone: "coral",
        izoh: null,
        tartib,
        onClick: noop,
        onBosilmagan: noop,
      }),
    );

  it("SahnaJoy: the place's id, the theme's breathing class, the accent ring and the surface share the contrast tests measure", () => {
    const html = joy("active");
    expect(html).toContain('data-joy="kema"');
    expect(html).toContain('class="relative size-16 dengiz-bob"');
    expect(html).toContain("box-shadow:0 0 0 2px #0b5f86, 0 0 40px gold");
    expect(html).toContain(`style="background:#0b5f86">Boshlash<`);
    expect(html).toContain(`bg-surface/${Math.round(CARD_SURFACE_ALPHA * 100)}`);
    expect(html).not.toContain("backdrop-");
    expect(joy("locked")).toContain("data-tuman");
    expect(joy("locked", 1)).toContain("flex-row-reverse");
  });

  it("SahnaMukofotFoni: the theme's tokens, its sunburst only for a celebration", () => {
    const foni = (bayram: boolean) =>
      renderToStaticMarkup(
        createElement(SahnaMukofotFoni, { tema: "alp", bayram } as ComponentProps<typeof SahnaMukofotFoni>, "Dars tugadi!"),
      );
    expect(foni(false)).toContain('data-mukofot="alp"');
    expect(foni(false)).toContain("var(--alp-mukofot-ust)");
    expect(foni(false)).toContain("var(--alp-tepalik)");
    expect(foni(false)).not.toContain("alp-burst");
    expect(foni(true)).toContain("alp-burst");
    expect(foni(true)).toContain("var(--alp-mukofot-nur)");
    expect(foni(true)).toContain("Dars tugadi!");
  });
});
