import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { DebtSplit } from "@/components/payments/overview/types";
import { OverduePromisesBanner } from "./overdue-promises-banner";

const SPLIT: DebtSplit = {
  studying: {
    total: 39_150_000,
    count: 219,
    currentMonth: 36_990_000,
    older: 2_160_000,
  },
  notStudying: { total: 36_540_000, count: 305 },
};

const summary = (overduePromises: number) => ({
  split: SPLIT,
  openPromises: 9,
  overduePromises,
});

// Same formatter the banner uses, so the assertions hold whatever ICU the machine
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

/** The summary sits in the cache under the key the banner asks with. */
function render(data: ReturnType<typeof summary> | null): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (data) client.setQueryData(["debtors", "summary", undefined], data);
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(OverduePromisesBanner),
    ),
  );
}

describe("OverduePromisesBanner", () => {
  it("names the debt of those who study — not a «Jami qarz»", () => {
    const text = norm(render(summary(5)));

    expect(text).toContain(`${num(5)} ta to'lov sanasi o'tib ketgan`);
    expect(text).toContain(
      `O'qiyotganlar qarzi ${money(39_150_000)} · ${num(9)} ta sana kutilmoqda`,
    );
    expect(text).not.toContain("Jami qarz");
  });

  it("prints only the first number, never the other and never their sum", () => {
    const text = norm(render(summary(5)));

    expect(text).not.toContain(num(36_540_000));
    expect(text).not.toContain(num(39_150_000 + 36_540_000));
  });

  it("opens the broken promises straight away, not through the old-link redirect", () => {
    expect(render(summary(5))).toContain('href="/payments/debt?promise=broken"');
  });

  it("renders nothing when no promise is overdue, or before the answer", () => {
    expect(render(summary(0))).toBe("");
    expect(render(null)).toBe("");
  });
});
