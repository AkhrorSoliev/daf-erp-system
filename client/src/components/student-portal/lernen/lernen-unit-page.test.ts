import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/lernen/units/7",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { LernenUnitPage } from "./lernen-unit-page";
import type { LernenSeans, LernenUnit } from "./types";

function seans(
  id: number,
  kind: LernenSeans["kind"],
  completedAt: string | null,
): LernenSeans {
  return {
    id,
    order: id,
    kind,
    titleDe: "",
    titleUz: null,
    wordCount: 0,
    exerciseCount: 0,
    completedAt,
    bestScore: completedAt ? 80 : 0,
    runs: completedAt ? 1 : 0,
  };
}

const unit: LernenUnit = {
  id: 7,
  level: "A1",
  label: "A1",
  order: 4,
  titleUz: "Ovqat va ichimlik",
  titleDe: "Essen und Trinken",
  lessons: [],
  bereit: true,
  finalTest: null,
  sections: [
    {
      id: 70,
      order: 1,
      code: "u04-s1",
      titleUz: "Oziq-ovqat",
      titleDe: "Lebensmittel",
      lessons: [
        seans(1, "SECTION_A", "2026-10-04T10:00:00Z"),
        seans(2, "SECTION_B", null),
        // A finished bridge is not a section lesson: no «Yana mashq» under it.
        seans(5, "BRIDGE", "2026-10-04T11:00:00Z"),
      ],
      woerter: { jami: 28, gesehen: 14 },
    },
    {
      id: 71,
      order: 2,
      code: "u04-s2",
      titleUz: "Supermarket",
      titleDe: "Im Supermarkt",
      lessons: [seans(3, "SECTION_A", null)],
      woerter: { jami: 9, gesehen: 9 },
    },
    {
      id: 72,
      order: 3,
      code: "u04-s3",
      titleUz: "Nimani yoqtirasan?",
      titleDe: "Was isst du gern?",
      lessons: [seans(4, "SECTION_A", null)],
    },
  ],
};

async function matn(): Promise<string> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  await client.prefetchQuery({ queryKey: ["lernen", "unit", 7], queryFn: () => unit });
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(LernenUnitPage, { unitId: 7 }),
    ),
  )
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
}

describe("the unit page counts a section's words (ADR-0071)", () => {
  it("shows the seen and total words of each section", async () => {
    const text = await matn();
    expect(text).toContain("So'zlar: 14 / 28");
    expect(text).toContain("So'zlar: 9 / 9");
  });

  it("asks for another round under a finished lesson while words are left", async () => {
    const text = await matn();
    expect(text.match(/Yana mashq qilish · 14 yangi so'z/g)).toHaveLength(1);
  });

  it("draws no counter for a section the server sent no counts for", async () => {
    const text = await matn();
    expect(text.match(/So'zlar:/g)).toHaveLength(2);
  });
});
