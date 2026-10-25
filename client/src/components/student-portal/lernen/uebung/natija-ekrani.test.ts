import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/lernen/lessons/9",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { NatijaEkrani, type NatijaEkraniProps } from "./natija-ekrani";

const asos: NatijaEkraniProps = {
  togri: 12,
  jami: 15,
  durationMs: 65_000,
  xatolar: [],
  unitId: 7,
  onQayta: () => {},
  natija: null,
};

function render(p: Partial<NatijaEkraniProps> = {}): string {
  const client = new QueryClient();
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(NatijaEkrani, { ...asos, ...p })),
  );
}

const sinov = (bestanden: boolean) => ({
  tur: "tayyor" as const,
  natija: { bestanden, avvalOtilgan: false, togri: 12, jami: 15, kerak: 14 },
});

describe("<NatijaEkrani /> celebrates only what deserves it (ADR-0128)", () => {
  it("an ordinary lesson: the theme's reward background, Dafi cheers, confetti", () => {
    const html = render();
    expect(html).toContain("bg-coral-500/10");
    expect(html).toContain('data-holat="bayram"');
    expect(html).toContain("<canvas");
  });

  it("a final test the server has not decided yet: Dafi thinks, nothing is thrown", () => {
    const html = render({ sinov: { tur: "kutilmoqda" } });
    expect(html).toContain('data-holat="oylayapti"');
    expect(html).not.toContain("<canvas");
  });

  it("a failed final test: the soft miss, an amber card, no confetti and no red", () => {
    const html = render({ sinov: sinov(false) });
    expect(html).toContain('data-holat="xato"');
    expect(html).not.toContain("<canvas");
    expect(html).toContain("bg-amber-500/10");
    expect(html).not.toContain("danger");
  });

  it("a passed final test celebrates", () => {
    const html = render({ sinov: sinov(true) });
    expect(html).toContain('data-holat="bayram"');
    expect(html).toContain("<canvas");
  });

  it("a review says so", () => {
    expect(render({ takrorlash: true })).toContain("Takrorlash tugadi!");
  });
});

describe("<NatijaEkrani /> structure", () => {
  // `.lumio [data-kam-harakat] .lumio-fade-up` is a descendant rule, so the marker
  // root must not be the fading box; the fixed canvas is the fading box's sibling
  // (inside it the box's transform would size the canvas to the box for ~320 ms).
  it("mounts the confetti beside the fading content, directly under the root", () => {
    expect(render()).toMatch(/^<div[^>]*><canvas[^>]*><\/canvas><div class="lumio-fade-up/);
  });

  it("without a celebration the fading content is the root's only child", () => {
    expect(render({ sinov: { tur: "kutilmoqda" } })).toMatch(/^<div[^>]*><div class="lumio-fade-up/);
  });

  // Only the final-test card is a live region (it announces its summary once);
  // the scene's counting numbers must not be.
  it("an ordinary lesson has no live region at all", () => {
    expect(render()).not.toContain("aria-live");
  });

  it("the final-test card still announces its summary politely", () => {
    expect(render({ sinov: sinov(true) })).toContain('aria-live="polite"');
  });
});
