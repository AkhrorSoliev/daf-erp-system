import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// The list's filters live in the URL; a test picks them through this.
const url = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/payments/debt",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(url.search),
}));

// A zustand store renders its INITIAL state on the server, whatever `setState`
// has since set, so the signed-in CEO has to come from the module itself.
vi.mock("@/hooks/use-auth", () => {
  const state = { user: { roles: [{ id: 1, name: "CEO" }] } };
  const useAuth = Object.assign(
    (select: (s: typeof state) => unknown) => select(state),
    { getState: () => state, setState: () => {}, subscribe: () => () => {} },
  );
  return { useAuth };
});

import type { DebtSplit } from "../overview/types";
import { DebtFiltersProvider } from "./debt-filters-provider";
import { DebtorsView } from "./debtors-view";

// The two debts (ADR-0059) — chosen so that no count equals an amount and the
// sum of the two totals (75 690 000) is a figure the page must never print.
const SPLIT: DebtSplit = {
  studying: {
    total: 39_150_000,
    count: 219,
    currentMonth: 36_990_000,
    older: 2_160_000,
  },
  notStudying: { total: 36_540_000, count: 305 },
};

const SUMMARY = { split: SPLIT, openPromises: 9, overduePromises: 5 };

// Same formatter the cards use, so the assertions hold whatever ICU the machine
// running the tests carries; `norm` turns its U+00A0 into a plain space like the
// page text it is compared with.
const num = (n: number) => norm(n.toLocaleString("uz-UZ"));
const money = (n: number) => norm(`${n.toLocaleString("uz-UZ")} so'm`);

function norm(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/**
 * The page as the CEO's request returns it. The summary is read from the cache
 * under the key the page asks with — no branch is selected in a bare store — so
 * a page that keyed it on anything else would print «—» here.
 */
function render(summary: typeof SUMMARY | null = SUMMARY, search = ""): string {
  url.search = search;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (summary) client.setQueryData(["debtors", "summary", undefined], summary);
  return norm(
    renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          DebtFiltersProvider,
          null,
          createElement(DebtorsView),
        ),
      ),
    ),
  );
}

describe("DebtorsView — the summary cards", () => {
  it("shows the two debts as two cards, each with its own count", () => {
    const text = render();

    expect(text).toContain(
      `O'qiyotganlar qarzi ${money(39_150_000)} ${num(219)} ta`,
    );
    expect(text).toContain(
      `O'qimayotganlar qarzi ${money(36_540_000)} ${num(305)} ta`,
    );
  });

  it("splits the first one into shu oy and eski qarz", () => {
    const text = render();

    expect(text).toContain(
      `🟡 shu oy ${num(36_990_000)} · 🔴 eski qarz ${num(2_160_000)}`,
    );
    // Only the first number is split: one such line on the page.
    expect(text.match(/🟡/g)).toHaveLength(1);
  });

  it("has no combined total, no debtor count and no average, and never adds the two", () => {
    const text = render();

    expect(text).not.toContain("Jami qarz");
    expect(text).not.toContain("Qarzdorlar soni");
    expect(text).not.toContain("O'rtacha qarz");
    expect(text).not.toContain(num(39_150_000 + 36_540_000));
  });

  it("keeps the promise card", () => {
    const text = render();

    expect(text).toContain(`Belgilangan / muddati o'tgan ${num(9)} / ${num(5)}`);
  });

  it("says under the cards that the list's filters do not touch them", () => {
    expect(render()).toContain("Ro'yxat filtrlari bu kartalarga ta'sir qilmaydi");
    // Also before the answer arrives: the line describes the cards, not the data.
    expect(render(null)).toContain(
      "Ro'yxat filtrlari bu kartalarga ta'sir qilmaydi",
    );
  });

  it("shows a dash, never a zero, until the summary arrives", () => {
    const text = render(null);

    expect(text).toContain("O'qiyotganlar qarzi —");
    expect(text).toContain("O'qimayotganlar qarzi —");
    expect(text).not.toContain("🟡");
  });

  // The cards describe the whole branch scope, so the status picked in the list
  // must not give them a different cache entry (and a second request).
  it("does not follow the status picked in the list", () => {
    const text = render(SUMMARY, "holat=FROZEN");

    expect(text).toContain(
      `O'qiyotganlar qarzi ${money(39_150_000)} ${num(219)} ta`,
    );
    expect(text).toContain(
      `O'qimayotganlar qarzi ${money(36_540_000)} ${num(305)} ta`,
    );
  });
});
