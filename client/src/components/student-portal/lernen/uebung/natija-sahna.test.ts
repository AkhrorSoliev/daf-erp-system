import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NatijaSahna, ballMatni, type NatijaSahnaProps } from "./natija-sahna";

const asos: NatijaSahnaProps = {
  togri: 12,
  jami: 15,
  durationMs: 65_000,
  ball: null,
  serie: null,
  hissiyot: { bayram: true, dafi: "bayram" },
};

const render = (p: Partial<NatijaSahnaProps> = {}) =>
  renderToStaticMarkup(createElement(NatijaSahna, { ...asos, ...p }));
const matn = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

describe("<NatijaSahna />", () => {
  it("says the lesson is done, with the score and the time", () => {
    const t = matn(render());
    expect(t).toContain("Dars tugadi!");
    expect(t).toContain("12 / 15 · 1:05");
  });

  it("a review says so", () => {
    expect(matn(render({ sarlavha: "takrorlash" }))).toContain("Takrorlash tugadi!");
  });

  // A failed or pending final test must not read as success («Lektion geschafft!»).
  it("a neutral heading says «Natija», not that the lesson is done", () => {
    const t = matn(render({ sarlavha: "neytral" }));
    expect(t).toContain("Natija");
    expect(t).not.toContain("Dars tugadi!");
    expect(t).toContain("12 / 15 · 1:05");
  });

  it("shows points, accuracy and the streak as three cards", () => {
    const t = matn(render({ ball: 20, serie: 4 }));
    expect(t).toContain("Ball");
    expect(t).toContain("Aniqlik");
    expect(t).toContain("Seriya");
    expect(t).toContain("80%");
    expect(t).not.toContain("—");
  });

  it("draws a dash, not a zero, while the server has not answered", () => {
    expect(matn(render()).match(/—/g)).toHaveLength(2);
  });

  it("a celebration: Dafi cheers", () => {
    expect(render()).toContain('data-holat="bayram"');
  });

  it("no celebration: Dafi takes the soft miss", () => {
    expect(render({ hissiyot: { bayram: false, dafi: "xato" } })).toContain('data-holat="xato"');
  });

  // The confetti is thrown by the result screen, as a sibling of the fading
  // content: a `fixed` canvas inside the fade-up box would be sized to that box.
  it("throws no confetti itself", () => {
    expect(render()).not.toContain("<canvas");
  });

  // The sub-line sits on the theme's tint: the secondary grey is under 4.5:1 there.
  it("draws the score line darker than the secondary grey", () => {
    const html = render();
    expect(html).toContain("text-ink-600");
    expect(html).not.toContain("text-ink-500");
  });

  // The caption is 11px text, so it needs 4.5:1: white on coral-500 is 2.82:1,
  // white on coral-700 (#c83d20) is 5.07:1 (the coral tokens are the same in dark mode).
  it("fills the three captions with the deep coral, so the white text reads", () => {
    const html = render({ ball: 20, serie: 4 });
    expect(html.match(/<p class="bg-coral-700[^"]*text-white/g)).toHaveLength(3);
    expect(html).not.toContain("bg-coral-500");
  });

  // 11px caps over a card that is 77 px wide at 360 and 64 px at 320 (the shell, the page and the
  // reward background take 48 px a side): German «GENAUIGKEIT» was 78 px and clipped. Below `sm`
  // the caption is 10 px with normal tracking and 2 px padding (68 px); at 320 it wraps, never clips.
  it("sets the captions so no word clips on a narrow phone", () => {
    const html = render({ ball: 20, serie: 4 });
    const klasslar = [...html.matchAll(/<p class="(bg-coral-700[^"]*)"/g)].map((m) => m[1].split(" "));
    expect(klasslar).toHaveLength(3);
    for (const k of klasslar) {
      for (const sinf of ["px-0.5", "text-[10px]", "tracking-normal", "sm:text-[11px]", "sm:tracking-wide", "break-words", "hyphens-auto"]) {
        expect(k, sinf).toContain(sinf);
      }
      expect(k).not.toContain("tracking-wide");
      expect(k).not.toContain("text-[11px]");
      expect(k).not.toContain("px-1");
    }
  });

  // The card clips its children to its rounded corner. With a 36 px radius (rounded-2xl under
  // .lumio, --radius 20 px x 1.8) the clip radius inside the 2 px border is 34 px; the bar's
  // first and last letters lie at x ~ 4-10 px, y ~ 6.5 px (cap tops), where the arc hides every
  // x below 34 - sqrt(34^2 - (34-6.5)^2) = 14 px: «G» and «T» of «GENAUIGKEIT», «ТОЧНОСТЬ» were cut.
  // rounded-md is 16 px (clip radius 14) and py-1.5 puts the cap tops at y ~ 8.5: the arc then
  // hides only x < 14 - sqrt(14^2 - (14-8.5)^2) = 1.1 px, clear of the widest caption (x >= 2).
  it("rounds the card so its corners do not eat the caption's first and last letters", () => {
    const html = render({ ball: 20, serie: 4 });
    const kartalar = [...html.matchAll(/<div class="([^"]*border-coral-700[^"]*)"/g)].map((m) => m[1].split(" "));
    expect(kartalar).toHaveLength(3);
    for (const k of kartalar) {
      expect(k).toContain("rounded-md");
      expect(k).toContain("sm:rounded-2xl");
      expect(k).not.toContain("rounded-2xl");
      expect(k).toContain("overflow-hidden");
    }
    for (const m of html.matchAll(/<p class="(bg-coral-700[^"]*)"/g)) {
      const k = m[1].split(" ");
      expect(k).toContain("py-1.5");
      expect(k).not.toContain("py-1");
    }
  });

  // A German caption that wraps at 320 px makes its bar two lines tall; the three bars share
  // the card grid's rows (subgrid), so all three stay equally tall and the value rows line up.
  it("keeps the three caption bars and the three value rows aligned", () => {
    const html = render({ ball: 20, serie: 4 });
    expect(html).toMatch(/<div class="[^"]*\bgrid-cols-3\b[^"]*\bgap-x-2\.5\b[^"]*"/);
    expect(html).not.toMatch(/\bgap-2\.5\b/);
    const kartalar = [...html.matchAll(/<div class="([^"]*border-coral-700[^"]*)"/g)].map((m) => m[1].split(" "));
    for (const k of kartalar) {
      for (const sinf of ["row-span-2", "grid", "grid-rows-subgrid"]) expect(k, sinf).toContain(sinf);
      // Without it the card's column is auto-sized and grows to the widest value row.
      expect(k, "grid-cols-1").toContain("grid-cols-1");
    }
    // The text stays centred in a bar that is taller than its own line, and may shrink to wrap.
    for (const m of html.matchAll(/<p class="(bg-coral-700[^"]*)"><span class="([^"]*)"/g)) {
      const bar = m[1].split(" ");
      for (const sinf of ["flex", "items-center", "justify-center"]) expect(bar, sinf).toContain(sinf);
      expect(m[2].split(" ")).toContain("min-w-0");
    }
  });

  // The card's inner width is 64 px at 320 and 77 px at 360. The «100%» value needs 51.5 px at
  // 20 px; with the icon (18), the gap and the padding that is 85.5 px, so the row used to push the
  // card's column wider and the card clipped it («%» and the icon gone). Below `sm` the value is
  // 18 px (46.35), the gap 2 px and the padding 2 px a side: 74.35 -> fits 77 at 360 (and 87 at 390);
  // at 320 it cannot fit one line, so the icon wraps above the value instead of being clipped.
  it("lets the value row shrink or wrap instead of pushing the card wider", () => {
    const html = render({ ball: 20, serie: 4 });
    const qatorlar = [...html.matchAll(/<p class="([^"]*font-display[^"]*)"/g)].map((m) => m[1].split(" "));
    expect(qatorlar).toHaveLength(3);
    for (const k of qatorlar) {
      for (const sinf of [
        "flex",
        "flex-wrap",
        "items-center",
        "justify-center",
        "content-center",
        "min-w-0",
        "gap-0.5",
        "px-0.5",
        "text-lg",
        "sm:gap-1",
        "sm:px-1.5",
        "sm:text-xl",
      ]) {
        expect(k, sinf).toContain(sinf);
      }
      for (const eski of ["gap-1", "px-1.5", "text-xl"]) expect(k, eski).not.toContain(eski);
    }
  });

  it("keeps the icons at full size when the row is tight", () => {
    const html = render({ ball: 20, serie: 4 });
    const belgilar = [...html.matchAll(/<svg[^>]*class="([^"]*(?:text-amber-500|text-teal-500|text-coral-500)[^"]*)"/g)];
    expect(belgilar).toHaveLength(3);
    for (const m of belgilar) expect(m[1].split(" ")).toContain("shrink-0");
  });

  // The server's 0 points is «0», not «+0»; any gain keeps the plus.
  it("shows 0 points as 0, without a plus", () => {
    const t = matn(render({ ball: 0, serie: 4 }));
    expect(t).toMatch(/Ball 0 /);
    expect(t).not.toMatch(/\+\d/);
  });

  it("shows points earned with a plus", () => {
    expect(matn(render({ ball: 20, serie: 4 }))).toMatch(/Ball \+\d/);
  });

  // The count-up changes every frame; a live region would read each number out.
  it("announces nothing while the points count up", () => {
    expect(render({ ball: 20, serie: 4 })).not.toContain("aria-live");
  });
});

describe("ballMatni", () => {
  it("is a dash until the server answers", () => {
    expect(ballMatni(null, null)).toBe("—");
    expect(ballMatni(null, 7)).toBe("—");
  });
  it("is a plain 0 when the server says no points, whatever the count-up holds", () => {
    expect(ballMatni(0, null)).toBe("0");
    expect(ballMatni(0, 0)).toBe("0");
  });
  it("has a plus for points earned, counting up from +0", () => {
    expect(ballMatni(20, null)).toBe("+0");
    expect(ballMatni(20, 7)).toBe("+7");
    expect(ballMatni(20, 20)).toBe("+20");
  });
});
