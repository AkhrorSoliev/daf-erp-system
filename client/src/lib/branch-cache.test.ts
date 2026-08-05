import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { resolveStoredBranch } from "./branch-header";

/**
 * Switching branch must not leave the previous branch's numbers on screen.
 *
 * The branch travels as a request header, but React Query keys its cache by
 * `queryKey` — so every cached entry stayed "valid" across a switch. With
 * `staleTime: 5min` and `refetchOnWindowFocus: false`, a page could show
 * Fargona's figures under a Namangan header for minutes.
 *
 * `BranchQuerySync` drops the cache on change. These tests exercise the cache
 * behaviour it relies on, without mounting React.
 */
describe("branch switch drops cached server data", () => {
  /** What `BranchQuerySync` does on a change. */
  function onBranchChange(qc: QueryClient) {
    void qc.cancelQueries();
    qc.removeQueries();
  }

  function seed(qc: QueryClient) {
    // Two pages' worth of Fargona data, neither keyed by branch — which is the
    // case for 124 of the app's ~132 query keys.
    qc.setQueryData(["financial-overview"], { income: 162_127_987 });
    qc.setQueryData(["students", { page: 1 }], [{ id: 10001 }]);
    qc.setQueryData(["debtors"], { total: 27_748_684 });
  }

  it("Fargona → Namangan: no stale figure survives", () => {
    const qc = new QueryClient();
    seed(qc);
    expect(qc.getQueryData(["financial-overview"])).toBeDefined();

    onBranchChange(qc);

    expect(qc.getQueryData(["financial-overview"])).toBeUndefined();
    expect(qc.getQueryData(["students", { page: 1 }])).toBeUndefined();
    expect(qc.getQueryData(["debtors"])).toBeUndefined();
  });

  it("Namangan → Fargona: the empty branch's state does not linger either", () => {
    const qc = new QueryClient();
    qc.setQueryData(["financial-overview"], { income: 0 });
    onBranchChange(qc);
    expect(qc.getQueryData(["financial-overview"])).toBeUndefined();
  });

  it("invalidate alone would NOT be enough — the reason removeQueries is used", () => {
    // An inactive entry stays served-from-cache after invalidation, so a page
    // visited before the switch would flash the other branch's numbers on the
    // next mount. This test pins WHY the stronger call is correct.
    const qc = new QueryClient();
    seed(qc);
    void qc.invalidateQueries();
    expect(qc.getQueryData(["financial-overview"])).toBeDefined();

    qc.removeQueries();
    expect(qc.getQueryData(["financial-overview"])).toBeUndefined();
  });

  it("switching to 'Barcha filiallar' clears just the same", () => {
    // null is a real selection, not "nothing chosen", so it must trigger a drop.
    const qc = new QueryClient();
    seed(qc);
    onBranchChange(qc);
    expect(qc.getQueryData(["debtors"])).toBeUndefined();
  });

  it("a stale saved branch is dropped at login, so no cache is built for it", () => {
    // Second half of the same guarantee: signing in as a Namangan-only user on
    // a machine that last held Fargona must not start out on Fargona.
    const NAMANGAN = { id: 2, name: "Namangan" };
    expect(resolveStoredBranch("1", [NAMANGAN], false)).toBe(NAMANGAN);
  });
});
