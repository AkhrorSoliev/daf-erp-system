import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/payments",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import type { PaymentHistory, StudentProfile } from "./lib/types";
import { StudentPaymentSummary } from "./student-payment-summary";

const profile: StudentProfile = {
  id: 10042,
  firstName: "Aziza",
  lastName: "Karimova",
  phone: "998901234567",
  extraPhone: null,
  parentPhone: null,
  parentName: null,
  telegram: null,
  photo: null,
  balance: -1_250_000,
  status: "ACTIVE",
  login: "aziza",
  date_of_birth: null,
  address: null,
  branches: [{ id: 1, name: "Farg'ona" }],
  groups: [],
};

const history: PaymentHistory = {
  payments: [],
  transactions: [
    {
      id: 1,
      type: "LESSON_DEDUCTION",
      amount: -450_000,
      balanceBefore: -800_000,
      balanceAfter: -1_250_000,
      description: "A1-12 guruhi: 12 dars uchun",
      createdAt: "2026-09-22T04:30:00.000Z",
    },
  ],
};

/** The page's markup once its balance and history have loaded. */
async function renderPage(): Promise<string> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  await client.prefetchQuery({
    queryKey: ["student-portal", "profile"],
    queryFn: () => profile,
  });
  await client.prefetchQuery({
    queryKey: ["student-portal", "payments"],
    queryFn: () => history,
  });
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(StudentPaymentSummary),
    ),
  ).replace(/&#x27;/g, "'");
}

function classLists(html: string): string[][] {
  return [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1].split(/\s+/));
}

// On a 390px phone the page laid out 627px wide. The quick amounts were a
// sideways-scrolling strip whose chips could not shrink, and the page grid's
// implicit column grew to fit them, taking every card with it: Click, the
// "so'm" and the amounts in Balans tarixi sat past the right edge.
describe("To'lovlar on a phone", () => {
  it("offers the quick amounts as a grid, not a sideways-scrolling strip", async () => {
    const html = await renderPage();
    const scrollers = classLists(html).filter((list) =>
      list.some((c) => /^overflow-x-(auto|scroll)$/.test(c)),
    );
    expect(scrollers).toEqual([]);
  });

  it("keeps the page grid to the width of the screen", async () => {
    const html = await renderPage();
    const grid = classLists(html).find((list) =>
      list.includes("lg:grid-cols-2"),
    );
    expect(grid).toContain("grid-cols-1");
  });
});

describe("To'lovlar for a screen reader", () => {
  it("names the amount field, the quick amounts and the gateways", async () => {
    const html = await renderPage();
    expect(html).toContain('aria-label="To\'lov summasi"');
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(7);
    // While a payment starts the logo becomes a spinner; the name stays.
    expect(html).toContain('aria-label="Payme orqali to\'lash"');
    expect(html).toContain('aria-label="Click orqali to\'lash"');
  });
});
