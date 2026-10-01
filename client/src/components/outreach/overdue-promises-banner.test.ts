import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { DebtSplit } from "@/components/payments/payments-overview";
import { OverduePromisesBanner } from "./overdue-promises-banner";

const SPLIT: DebtSplit = {
  studying: {
    total: 43_500_000,
    count: 237,
    currentMonth: 41_100_000,
    older: 2_400_000,
  },
  notStudying: { total: 40_600_000, count: 327 },
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
function render(data: object | null): string {
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
      `O'qiyotganlar qarzi ${money(43_500_000)} · ${num(9)} ta sana kutilmoqda`,
    );
    expect(text).not.toContain("Jami qarz");
  });

  it("prints only the first number, never the other and never their sum", () => {
    const text = norm(render(summary(5)));

    expect(text).not.toContain(num(40_600_000));
    expect(text).not.toContain(num(43_500_000 + 40_600_000));
  });

  it("still opens the overdue promises", () => {
    expect(render(summary(5))).toContain('href="/payments/debt?promise=overdue"');
  });

  // The client goes live before the server (PR 1 deploys the client first), so
  // for a few minutes it reads the answer of a server older than ADR-0059: a
  // `totalDebt` and no `split`. The banner keeps what that server still answers,
  // the promise counts, and leaves the debt out of its line — no «Jami qarz», no
  // zero, and not the old total under the new label.
  it("against a server older than the split, keeps the promise counts and drops the debt part", () => {
    const text = norm(
      render({ totalDebt: 28_453_233, openPromises: 9, overduePromises: 5 }),
    );

    expect(text).toContain(`${num(5)} ta to'lov sanasi o'tib ketgan`);
    expect(text).toContain(`${num(9)} ta sana kutilmoqda`);
    expect(text).not.toContain("O'qiyotganlar qarzi");
    expect(text).not.toContain("Jami qarz");
    expect(text).not.toContain(money(0));
    expect(text).not.toContain(num(28_453_233));
    // The separator belongs to the debt part: nothing is left dangling.
    expect(text).not.toContain("·");
  });

  it("renders nothing when no promise is overdue, or before the answer", () => {
    expect(render(summary(0))).toBe("");
    expect(render(null)).toBe("");
  });
});
