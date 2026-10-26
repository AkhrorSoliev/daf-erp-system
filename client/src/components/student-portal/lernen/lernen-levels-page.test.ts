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
import { SAHNA_PARDASI } from "./tema/sahna-ramka";
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

describe("the path page in the «O'rmon» look (ADR-0131)", () => {
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
});

describe("the path page in the «Toza» look", () => {
  it("draws no scene and no plates", () => {
    const h = render({ levels: LEVELS });
    expect(h).not.toContain("data-sahna");
    expect(h).not.toContain(SAHNA_PARDASI);
    expect(h).not.toMatch(/^<div[^>]*\bisolate\b/);
  });
});
