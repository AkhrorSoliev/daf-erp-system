import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { routeLabels } from "@/lib/breadcrumb-routes";
import { formatNumber } from "@/lib/format-utils";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/payments/refunds/history",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import { keepWithinBranch, refundHistoryKey } from "./refunds-queries";
import { RefundHistoryPage } from "./refund-history-page";
import type { RefundHistoryResponse, RefundHistoryRow } from "./refunds-types";

// Made-up names and figures.
const GIVEN: RefundHistoryRow = {
  id: "r1", student: { id: 10003, firstName: "Olim", lastName: "Karimov", phone: "901234567" }, amount: 300_000,
  status: "COMPLETED", reason: null, requestedAt: "2026-09-15T06:00:00Z", dueDate: "2026-09-29",
  handedOverAt: "2026-09-24T07:00:00Z", refundMethod: "CASH", cancelledAt: null, cancelReason: null, closedBy: { id: 10050, name: "Kamola" },
};
const CANCELLED: RefundHistoryRow = {
  ...GIVEN, id: "r2", amount: 95_000, status: "REJECTED", requestedAt: "2026-08-20T06:00:00Z", handedOverAt: null,
  refundMethod: null, cancelledAt: "2026-08-22T06:00:00Z", cancelReason: "Guruhga qaytdi", closedBy: { id: 10060, name: "Dilshod" },
};
const RESPONSE: RefundHistoryResponse = { data: [GIVEN, CANCELLED], total: 2, page: 1, pageSize: 10 };

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

function render(response: RefundHistoryResponse | null = RESPONSE, page = 1) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (response) client.setQueryData(refundHistoryKey(undefined, page, 10), response);
  return norm(renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(TooltipProvider, null, createElement(RefundHistoryPage)))));
}

describe("RefundHistoryPage (spec §3.6)", () => {
  it("the way back, the title, the columns and both kinds of row", () => {
    const text = render();
    expect(text).toContain("Qaytariladigan pul Qaytarishlar tarixi Berilgan va bekor qilingan so'rovlar");
    expect(text).toContain("# O'quvchi Summa So'ralgan Berildi Kim berdi / Kim bekor qildi");
    expect(text).toContain(`Olim Karimov ID 10003`);
    expect(text).toContain(`${norm(formatNumber(300_000))} 15.09 24.09 · naqd Kamola`);
    expect(text).toContain(`${norm(formatNumber(95_000))} 20.08 bekor qilindi Dilshod`);
  });

  it("empty history says so", () => {
    expect(render({ data: [], total: 0, page: 1, pageSize: 10 })).toContain("Hali berilgan yoki bekor qilingan so'rov yo'q");
  });

  it("a page past the last one shows a skeleton, not the empty text, while it moves to the last page", () => {
    nav.search = "page=3";
    try {
      const text = render({ data: [], total: 12, page: 3, pageSize: 10 }, 3);
      expect(text).not.toContain("Hali berilgan yoki bekor qilingan so'rov yo'q");
    } finally {
      nav.search = "";
    }
  });

  it("the previous page is kept only for the same branch", () => {
    expect(keepWithinBranch(2)(RESPONSE, { queryKey: refundHistoryKey(2, 1, 10) })).toBe(RESPONSE);
    expect(keepWithinBranch(2)(RESPONSE, { queryKey: refundHistoryKey(1, 1, 10) })).toBeUndefined();
    expect(keepWithinBranch(undefined)(RESPONSE, { queryKey: refundHistoryKey(1, 1, 10) })).toBeUndefined();
    expect(keepWithinBranch(2)(undefined, undefined)).toBeUndefined();
  });

  it("the breadcrumb names both segments", () => {
    expect(routeLabels.refunds).toBe("Qaytariladigan pul");
    expect(routeLabels.history).toBe("Tarix");
  });
});
