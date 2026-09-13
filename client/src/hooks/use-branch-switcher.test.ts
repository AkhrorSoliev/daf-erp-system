import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { BRANCH_STORAGE_KEY } from "@/lib/branch-header";
import { useBranchSwitcher } from "./use-branch-switcher";

const FARGONA = { id: 1, name: "Fargona" };
const NAMANGAN = { id: 2, name: "Namangan" };

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(async () => ({ data: [FARGONA, NAMANGAN] })) },
}));

class MemoryStorage {
  private items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  clear() {
    this.items.clear();
  }
}

const store = () => useBranchSwitcher.getState();

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  useBranchSwitcher.setState(useBranchSwitcher.getInitialState(), true);
});

/**
 * `BranchScopedMain` keys the dashboard's `<main>` on `scopeVersion`, so every
 * bump throws away the page's local state — typed form input included — and
 * re-runs its mount-time requests.
 *
 * The old key went from a "boot" sentinel to the branch id when the switcher
 * resolved, which is a key change too: every hard load remounted every page
 * once, after `GET /branches` returned. On a slow connection that erased the
 * title typed into `/leads/forms/new`, and on every connection it fired the
 * page's first requests twice. Those first requests already carried the right
 * branch — `api.ts` reads it from `localStorage` — so only a resolution that
 * CHANGES the stored branch has anything stale to discard.
 */
describe("scopeVersion — when the page content must remount", () => {
  it("does not remount when a CEO resolves to the branch already saved", async () => {
    localStorage.setItem(BRANCH_STORAGE_KEY, "2");
    useBranchSwitcher.setState({ canSelectAll: true });

    await store().fetchBranches();

    expect(store().selectedBranch).toEqual(NAMANGAN);
    expect(store().scopeVersion).toBe(0);
  });

  it("does not remount when a CEO with nothing saved lands on 'Barcha filiallar'", async () => {
    // Nothing saved and "all" send the same absent header.
    useBranchSwitcher.setState({ canSelectAll: true });

    await store().fetchBranches();

    expect(store().selectedBranch).toBeNull();
    expect(store().scopeVersion).toBe(0);
  });

  it("does not remount when a non-CEO hydrates onto their saved branch", () => {
    localStorage.setItem(BRANCH_STORAGE_KEY, "2");

    store().hydrateFor([NAMANGAN], false);

    expect(store().scopeVersion).toBe(0);
  });

  it("remounts when the saved branch is no longer allowed and gets replaced", () => {
    // The page's first requests asked for Fargona; the user may only see
    // Namangan. That data is stale and must be discarded.
    localStorage.setItem(BRANCH_STORAGE_KEY, "1");

    store().hydrateFor([NAMANGAN], false);

    expect(store().selectedBranch).toEqual(NAMANGAN);
    expect(localStorage.getItem(BRANCH_STORAGE_KEY)).toBe("2");
    expect(store().scopeVersion).toBe(1);
  });

  it("remounts on every real switch, including switching back", () => {
    localStorage.setItem(BRANCH_STORAGE_KEY, "1");
    store().hydrateFor([FARGONA, NAMANGAN], true);
    expect(store().scopeVersion).toBe(0);

    store().selectBranch(NAMANGAN);
    expect(store().scopeVersion).toBe(1);

    store().selectBranch(FARGONA);
    expect(store().scopeVersion).toBe(2);

    store().selectBranch(null);
    expect(store().scopeVersion).toBe(3);
  });

  it("does not remount when the current branch is picked again", () => {
    localStorage.setItem(BRANCH_STORAGE_KEY, "1");
    store().hydrateFor([FARGONA, NAMANGAN], true);

    store().selectBranch(FARGONA);

    expect(store().scopeVersion).toBe(0);
  });

  it("on refetch, keeps a surviving branch and remounts only when it disappeared", async () => {
    localStorage.setItem(BRANCH_STORAGE_KEY, "1");
    store().hydrateFor([FARGONA, NAMANGAN], false);

    await store().refetchBranches();
    expect(store().scopeVersion).toBe(0);

    // Fargona was archived.
    vi.mocked(api.get).mockResolvedValueOnce({ data: [NAMANGAN] });
    await store().refetchBranches();

    expect(store().selectedBranch).toEqual(NAMANGAN);
    expect(store().scopeVersion).toBe(1);
  });
});
