import { describe, expect, it } from "vitest";
import { debtListParams, hasDebtFilter, lastPageIfPast, legacyDebtRedirect, readDebtFilters } from "./debt-url";

describe("legacyDebtRedirect — old links keep working (spec §2.6)", () => {
  it("sends the old tabs to their new homes", () => {
    expect(legacyDebtRedirect({ tab: "oylik" })).toBe("/payments/debt-history");
    expect(legacyDebtRedirect({ tab: "kechirilgan" })).toBe("/payments/debt-write-offs");
    expect(legacyDebtRedirect({ tab: "muzlatilgan" })).toBe("/payments/refunds?tab=muzlatilgan");
    expect(legacyDebtRedirect({ tab: "markaz" })).toBe("/payments/salary?tab=markaz");
    expect(legacyDebtRedirect({ tab: "markaz", month: "2026-08" })).toBe("/payments/salary?tab=markaz&month=2026-08");
  });

  it("carries the filter the history page still reads", () => {
    expect(legacyDebtRedirect({ tab: "oylik", holat: "inactive" })).toBe("/payments/debt-history?holat=inactive");
    expect(legacyDebtRedirect({ tab: "oylik", holat: ["active", "x"] })).toBe("/payments/debt-history?holat=active");
  });

  it("the old debtor list becomes Shu oy; the outreach banner's promise link maps", () => {
    expect(legacyDebtRedirect({ tab: "qarzdorlar", search: "ali", holat: "FROZEN" })).toBe("/payments/debt?search=ali");
    expect(legacyDebtRedirect({ promise: "overdue" })).toBe("/payments/debt?promise=broken");
    expect(legacyDebtRedirect({ promise: "has_open" })).toBe("/payments/debt?promise=open");
  });

  it("leaves the new URLs alone", () => {
    expect(legacyDebtRedirect({})).toBeNull();
    expect(legacyDebtRedirect({ tab: "eski", promise: "broken" })).toBeNull();
  });
});

describe("the URL state and the request", () => {
  it("defaults: Shu oy, largest debt, page 1 of 20; the kind only in O'qimayotganlar", () => {
    expect(debtListParams(readDebtFilters(""))).toEqual({
      tab: "shu-oy", search: undefined, kind: undefined, groupIds: undefined, teacherIds: undefined,
      promise: undefined, sort: "debt", page: 1, pageSize: 20,
    });
    expect(debtListParams(readDebtFilters("tab=eski&kind=frozen")).kind).toBeUndefined();
    expect(debtListParams(readDebtFilters("tab=chiqqan&kind=frozen")).kind).toBe("frozen");
    expect(debtListParams(readDebtFilters("tab=xyz")).tab).toBe("shu-oy");
  });

  it("a filter is search, kind, group, teacher or promise — sort and paging are not", () => {
    expect(hasDebtFilter(readDebtFilters("sort=name&page=3"))).toBe(false);
    expect(hasDebtFilter(readDebtFilters("groupIds=g1"))).toBe(true);
    expect(hasDebtFilter(readDebtFilters("promise=none"))).toBe(true);
  });

  it("the kind is a filter only in O'qimayotganlar", () => {
    expect(hasDebtFilter(readDebtFilters("tab=eski&kind=frozen"))).toBe(false);
    expect(hasDebtFilter(readDebtFilters("tab=chiqqan&kind=frozen"))).toBe(true);
  });

  it("a value the server would refuse falls back to its default, so an old bookmark still opens", () => {
    expect(debtListParams(readDebtFilters("sort=debt_low&promise=overdue&page=0&pageSize=7"))).toMatchObject({
      sort: "debt", promise: undefined, page: 1, pageSize: 20,
    });
    expect(debtListParams(readDebtFilters("page=-3")).page).toBe(1);
    expect(debtListParams(readDebtFilters("page=abc")).page).toBe(1);
    expect(debtListParams(readDebtFilters("page=4&pageSize=50"))).toMatchObject({ page: 4, pageSize: 50 });
    expect(debtListParams(readDebtFilters("tab=chiqqan&kind=xyz")).kind).toBeUndefined();
    expect(debtListParams(readDebtFilters("teacherIds=abc,20001")).teacherIds).toBe("20001");
    expect(debtListParams(readDebtFilters(`search=${"a".repeat(150)}`)).search).toHaveLength(100);
  });

  it("the search is trimmed; whitespace alone is no search and no «Topildi»", () => {
    expect(debtListParams(readDebtFilters("search=%20%20ali%20")).search).toBe("ali");
    expect(debtListParams(readDebtFilters("search=%20%20%20")).search).toBeUndefined();
    expect(hasDebtFilter(readDebtFilters("search=%20%20%20"))).toBe(false);
  });

  it("a page past the last one goes to the last page that has rows", () => {
    expect(lastPageIfPast(3, 20, 25, 0)).toBe(2);
    expect(lastPageIfPast(9, 20, 5, 0)).toBe(1);
    expect(lastPageIfPast(2, 20, 25, 5)).toBeNull();
    expect(lastPageIfPast(1, 20, 25, 0)).toBeNull();
    expect(lastPageIfPast(3, 20, 0, 0)).toBeNull();
    // Rows the total does not explain: nowhere to go, so no write loop.
    expect(lastPageIfPast(2, 20, 25, 0)).toBeNull();
  });
});
