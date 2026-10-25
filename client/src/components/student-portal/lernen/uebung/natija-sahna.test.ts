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
