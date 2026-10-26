import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/lernen",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { LernenLevelsPage } from "./lernen-levels-page";
import { SAHNA_PARDASI, SAHNA_PARDASI_KICHIK } from "./tema/sahna-ramka";
import type { LernenLevel, LernenSeans } from "./types";

const seans = (id: number, completedAt: string | null): LernenSeans => ({
  id,
  order: id,
  kind: "SECTION_A",
  titleDe: "Begrüßung",
  titleUz: null,
  wordCount: 0,
  exerciseCount: 0,
  completedAt,
  bestScore: 0,
  runs: 0,
});

const LEVELS: LernenLevel[] = [
  {
    level: "A1",
    label: "A1",
    units: [
      {
        id: 7,
        order: 2,
        titleUz: "Sonlar",
        titleDe: "Zahlen",
        lessonCount: 2,
        doneCount: 1,
        bereit: true,
        finalTest: null,
        sections: [
          {
            id: 70,
            order: 1,
            code: "u02-s1",
            titleUz: "Sonlar",
            titleDe: "Zahlen",
            lessons: [seans(1, "2026-10-04T10:00:00Z"), seans(2, null)],
          },
        ],
      },
    ],
  },
];

/** The first paint: the profile (the look) and the path as given; nothing else has answered. */
function render({ tema, levels }: { tema?: string; levels?: LernenLevel[] }): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  if (tema) client.setQueryData(["student-portal", "profile"], { lernenTema: tema });
  if (levels) client.setQueryData(["lernen", "levels"], levels);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(LernenLevelsPage)));
}

describe("the path page in the «O'rmon» look (ADR-0132)", () => {
  it("stands the forest while the path is still loading: no gaps (spec §10)", () => {
    const h = render({ tema: "ormon" });
    expect(h).toContain('data-sahna="ormon"');
    expect(h).toMatch(/data-biom="tong" data-faol=""/);
    expect(h).toMatch(/^<div[^>]*class="[^"]*\bisolate\b/);
  });

  it("draws the forest nodes and puts the heading and the level divider on plates", () => {
    const h = render({ tema: "ormon", levels: LEVELS });
    expect(h).toContain('data-tugun="ormon"');
    expect(h).toContain(SAHNA_PARDASI);
    expect(h).toMatch(/w-fit rounded-full bg-surface px-2\.5 py-0\.5 shadow-lumio-sm">A1</);
  });

  // The page's own text on a plate needs 4.5:1. Light mode: ink-600 on the plain
  // surface is 6.58 (ink-500 is 3.97, ink-400 2.52).
  it("writes every plate's text in the readable ink: the subtitle, the heading, the level divider and the section caption", () => {
    const h = render({ tema: "ormon", levels: LEVELS });
    const tags = h.match(/<[a-z0-9]+ [^>]*>/g) ?? [];

    // Every element that is itself a plate (the header, the heading, the divider, the caption).
    const plates = tags.filter((tag) => tag.includes(SAHNA_PARDASI) || tag.includes(SAHNA_PARDASI_KICHIK));
    expect(plates.length, "no plate found").toBeGreaterThanOrEqual(4);
    for (const tag of plates) expect(tag).not.toMatch(/\btext-ink-(?:400|500)\b/);

    // The header's subtitle sits in a paragraph the shared header styles, so its text carries the ink itself.
    const subtitle = /<([a-z0-9]+) class="([^"]*)">Nemis tili</.exec(h);
    expect(subtitle, "the subtitle is missing").not.toBeNull();
    expect(subtitle?.[2]).toMatch(/\btext-ink-600\b/);
    expect(subtitle?.[2]).not.toMatch(/\btext-ink-500\b/);

    for (const text of ["A1", "Sonlar", "Imtihon yo&#x27;nalishlari"]) {
      expect(h, text).toMatch(new RegExp(`class="[^"]*\\btext-ink-600\\b[^"]*">${text}<`));
    }
  });
});

describe("the path page in the «Toza» look", () => {
  it("draws no scene and no plates", () => {
    const h = render({ levels: LEVELS });
    expect(h).not.toContain("data-sahna");
    expect(h).not.toContain(SAHNA_PARDASI);
    expect(h).not.toMatch(/^<div[^>]*\bisolate\b/);
  });

  // The new «O'rmon» inks must not leak into the look that has no scene.
  it("keeps its own greys exactly: the subtitle, the heading, the level divider and the section caption", () => {
    const h = render({ levels: LEVELS });
    expect(h).toContain('<p class="text-sm font-bold text-ink-500">Nemis tili</p>');
    expect(h).toContain('<h2 class="font-display text-sm font-bold uppercase tracking-wide text-ink-500">');
    expect(h).toContain('<span class="font-display text-sm font-extrabold uppercase tracking-wide text-ink-500">A1</span>');
    expect(h).toContain(
      '<p class="max-w-[132px] truncate text-center text-[11px] font-bold uppercase tracking-wide text-ink-400">Sonlar</p>',
    );
  });
});
