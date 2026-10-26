import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/lernen/units/7",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

// The hook reads the device switch in an effect, which a static render never runs.
const kam = vi.hoisted(() => ({ on: false }));
vi.mock("./harakat/use-kam-harakat", () => ({ useKamHarakat: () => kam.on }));

import { LernenUnitPage } from "./lernen-unit-page";
import type { LernenSeans, LernenUnit } from "./types";
import { SAHNA_PARDASI } from "./tema/sahna-ramka";

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

async function html(): Promise<string> {
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
  );
}

async function matn(): Promise<string> {
  return (await html())
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

// Spec §8: the unit page is not a bare list. Fixture order (one lock chain over
// the unit): 1 done, 2 current, 5 done, 3 and 4 locked.
describe("the unit page draws its lessons as places", () => {
  it("opens with the theme's banner: the unit's line and Dafi waving hello", async () => {
    const h = await html();
    expect(h).toContain("A1 · Essen und Trinken");
    expect(h).toContain('data-holat="salom"');
  });

  it("offers «Boshlash» on the current lesson only", async () => {
    expect((await matn()).match(/Boshlash/g)).toHaveLength(1);
  });

  it("keeps a locked lesson pressable for the locked sound, but tells it is closed", async () => {
    const h = await html();
    expect(h.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(h).not.toMatch(/<button[^>]*\sdisabled=""/);
    expect(h).toContain("Tanishuv — hali ochilmagan");
  });
});

// Controller rule (Task 2's CSS): the less-motion marker sits on the page's OUTER
// root and the stagger lives strictly inside it, never on the same element.
describe("the less-motion marker", () => {
  afterEach(() => {
    kam.on = false;
  });

  it("is on the outer root, ahead of the stagger, never on the stagger itself", async () => {
    kam.on = true;
    const h = await html();
    expect(h.match(/data-kam-harakat=""/g)).toHaveLength(1);
    expect(h.indexOf("data-kam-harakat")).toBeLessThan(h.indexOf("lumio-stagger"));
    expect(h).not.toMatch(/lumio-stagger[^>]*data-kam-harakat/);
  });

  it("is absent while the student keeps full motion", async () => {
    expect(await html()).not.toContain("data-kam-harakat");
  });
});

// New text on the page needs 4.5:1. Light-mode numbers: ink-600 on the page 5.80
// and on white 6.58 (ink-500 is 3.50 / 3.97, ink-400 2.22 / 2.52); the article
// green 4.75 on the page (the bright success green is 2.30); amber-ink 5.77 on
// white (coral-600 is 3.60). The banner is the theme's and keeps the path's palette.
describe("the unit page's own text is readable", () => {
  it("uses none of the grey, bright green or bright coral text classes", async () => {
    expect(await html()).not.toMatch(/\btext-(?:ink-500|ink-400|success|coral-600)\b/);
  });

  it("writes the words-left caption in the amber ink", async () => {
    expect(await html()).toMatch(/text-\[var\(--amber-ink\)\][^>]*>Yana mashq qilish/);
  });

  // White on coral-500 is 2.82:1; on its darker lip (72% with black) it is 5.06:1
  // (teal 4.56:1, grape 7.10:1).
  it("draws the «Boshlash» pill on the darker lip of the level colour", async () => {
    expect(await html()).toMatch(
      /text-white[^>]*style="background:color-mix\(in srgb, var\(--coral-500\) 72%, black\)">Boshlash</,
    );
  });
});

// ADR-0131: «O'rmon» stands the unit's forest behind the page and draws the
// lessons as places in it; «Toza» stays exactly as it was.
async function ormonHtml(order = unit.order): Promise<string> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  await client.prefetchQuery({ queryKey: ["lernen", "unit", 7], queryFn: () => ({ ...unit, order }) });
  client.setQueryData(["student-portal", "profile"], { lernenTema: "ormon" });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(LernenUnitPage, { unitId: 7 })),
  );
}

describe("the unit page in the «O'rmon» look (ADR-0131)", () => {
  it("stands the unit's forest in a frame behind the content (unit 4: the dawn again)", async () => {
    const h = await ormonHtml();
    expect(h).toContain('data-sahna="ormon"');
    expect(h).toMatch(/data-biom="tong" data-faol=""/);
    expect(h).toContain("pointer-events-none fixed inset-0 -z-10");
    expect(h).toMatch(/^<div[^>]*class="[^"]*\bisolate\b/);
  });

  // Unit 4 and the fallback (1) are both the dawn, so only another order shows
  // that the page hands `data.order` to the scene and to the header.
  it.each([
    [2, "kol"],
    [3, "kuz"],
  ] as const)("follows the unit's order: unit %i stands the %s biome in the scene and on the header", async (order, biome) => {
    const h = await ormonHtml(order);
    expect(h).toContain(`data-biom="${biome}" data-faol=""`);
    expect(h).not.toContain('data-biom="tong" data-faol=""');
    expect(h).toContain(`data-lavha-biom="${biome}"`);
  });

  it("draws each lesson as its place and the header in the unit's biome", async () => {
    const h = await ormonHtml();
    expect(h).toContain('data-joy="kulba"');
    expect(h).toContain('data-joy="koprik"');
    expect(h).toContain('data-joy="gor"');
    expect(h).toContain('data-lavha-biom="tong"');
  });

  it("gives the same lock answers: «Boshlash» once, two closed places", async () => {
    const h = await ormonHtml();
    expect(h.replace(/<[^>]*>/g, " ").match(/Boshlash/g)).toHaveLength(1);
    expect(h.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(h).toContain("Tanishuv — hali ochilmagan");
  });

  it("puts the page's own text on plates and uses no unreadable ink", async () => {
    const h = await ormonHtml();
    expect(h).toContain(SAHNA_PARDASI);
    expect(h).not.toMatch(/\btext-(?:ink-500|ink-400|success|coral-600)\b/);
  });
});

describe("the unit page in the «Toza» look", () => {
  it("draws no scene and no plates", async () => {
    const h = await html();
    expect(h).not.toContain("data-sahna");
    expect(h).not.toContain(SAHNA_PARDASI);
    expect(h).not.toMatch(/^<div[^>]*\bisolate\b/);
  });
});
