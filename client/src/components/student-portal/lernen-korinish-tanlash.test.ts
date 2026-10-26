import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { DEFAULT_LERNEN_TEMA, TAYYOR_TEMALAR } from "@/lib/lernen-temalar";
import { LernenKorinishTanlash } from "./lernen-korinish-tanlash";

/** The first paint: no profile answer yet, no effects run, so the defaults show. */
function render(): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(LernenKorinishTanlash)));
}

const radios = (html: string) => [...html.matchAll(/<button\b[^>]*role="radio"[^>]*>([\s\S]*?)<\/button>/g)];

describe("LernenKorinishTanlash (server markup)", () => {
  it("is one radiogroup with a radio for each finished look and nothing else", () => {
    const html = render();
    expect(html).toContain('role="radiogroup"');
    expect(radios(html)).toHaveLength(TAYYOR_TEMALAR.length);
    // Unfinished looks are not offered.
    expect(html).not.toContain("Dengiz");
    expect(html).not.toContain("Nemis sayohati");
  });

  it("offers «O'rmon» with its still miniature; «Toza» keeps its colour dot (spec §7)", () => {
    const [toza, ormon] = radios(render());
    expect(ormon[1]).toContain("O&#x27;rmon");
    expect(ormon[1]).toContain("Yumshoq qatlamli o&#x27;rmon");
    expect(ormon[1]).toContain('data-miniatyura="ormon"');
    expect(ormon[0]).toContain('aria-checked="false"');
    expect(toza[1]).toContain("background:#ff6b4a");
    expect(toza[1]).not.toContain("data-miniatyura");
  });

  it("marks the default look as the chosen one", () => {
    const [first] = radios(render());
    expect(DEFAULT_LERNEN_TEMA).toBe("toza");
    expect(first[0]).toContain('aria-checked="true"');
    expect(first[1]).toContain("Toza");
  });

  it("paints the chosen card with a tint that remaps in dark mode, not a fixed light pink", () => {
    const [first] = radios(render());
    expect(first[0]).toContain("border-coral-500");
    expect(first[0]).toContain("bg-coral-500/15");
    expect(first[0]).not.toContain("bg-coral-100");
    // The hint is one step darker (ink-600) on the tint: ink-500 is only 3.4:1 there in light mode.
    expect(first[1]).toContain("text-ink-600");
  });

  it("has the sound and the less-motion rows, each saying whether it is on", () => {
    const html = render();
    expect(html).toContain("Ovozlar");
    expect(html).toContain("Kam harakat");
    // Sound is on until switched off, reduced motion is off until switched on.
    expect(html).toContain("Yoqilgan");
    expect(html).toContain("O&#x27;chiq");
  });
});
