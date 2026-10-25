import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NatijaSahna, type NatijaSahnaProps } from "./natija-sahna";

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
    expect(matn(render({ takrorlash: true }))).toContain("Takrorlash tugadi!");
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

  // The count-up changes every frame; a live region would read each number out.
  it("announces nothing while the points count up", () => {
    expect(render({ ball: 20, serie: 4 })).not.toContain("aria-live");
  });
});
