import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { BRANCH_STORAGE_KEY } from "@/lib/branch-header";
import { branchStatusIn, useBranchSwitcher } from "./use-branch-switcher";

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
  // Drops any queued `mockResolvedValueOnce` so one test cannot leak into the next.
  vi.mocked(api.get).mockReset();
  vi.mocked(api.get).mockResolvedValue({ data: [FARGONA, NAMANGAN] });
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

  it("remounts when a non-CEO logs in with nothing saved and gets their first branch", () => {
    // The most common bump: logout clears the saved branch, so the page's first
    // requests went out with no header — the user's whole scope. For someone
    // with two branches that is the union of both, and it must be discarded.
    store().hydrateFor([FARGONA, NAMANGAN], false);

    expect(store().selectedBranch).toEqual(FARGONA);
    expect(store().scopeVersion).toBe(1);
  });

  it("keeps 'Barcha filiallar' across a refetch without remounting", async () => {
    localStorage.setItem(BRANCH_STORAGE_KEY, "all");
    useBranchSwitcher.setState({ canSelectAll: true });
    await store().fetchBranches();

    await store().refetchBranches();

    expect(store().selectedBranch).toBeNull();
    expect(store().scopeVersion).toBe(0);
  });

  it("compares against this tab's own selection once resolved, not another tab's write", () => {
    // Tab A shows Fargona; tab B switches to Namangan and rewrites the shared
    // storage. When tab A then picks Namangan, its on-screen rows are still
    // Fargona's — that is a switch for tab A even though storage already says 2.
    localStorage.setItem(BRANCH_STORAGE_KEY, "1");
    store().hydrateFor([FARGONA, NAMANGAN], true);
    localStorage.setItem(BRANCH_STORAGE_KEY, "2"); // tab B

    store().selectBranch(NAMANGAN);

    expect(store().scopeVersion).toBe(1);
  });

  it("keeps this tab's branch when the user is re-hydrated after another tab switched", () => {
    // `BranchSwitcher` re-runs `hydrateFor` whenever the `user` object changes —
    // every token refresh, every profile save. Re-reading the shared key there
    // would adopt tab B's switch in tab A, remount tab A mid-task (wiping a
    // half-filled form) and overwrite the key tab B's own requests rely on.
    localStorage.setItem(BRANCH_STORAGE_KEY, "1");
    store().hydrateFor([FARGONA, NAMANGAN], false);
    localStorage.setItem(BRANCH_STORAGE_KEY, "2"); // tab B

    store().hydrateFor([FARGONA, NAMANGAN], false); // token refresh in tab A

    expect(store().selectedBranch).toEqual(FARGONA);
    expect(store().scopeVersion).toBe(0);
    expect(localStorage.getItem(BRANCH_STORAGE_KEY)).toBe("2");
  });

  it("re-selects when a re-hydrated user lost access to this tab's branch", () => {
    localStorage.setItem(BRANCH_STORAGE_KEY, "1");
    store().hydrateFor([FARGONA, NAMANGAN], false);

    store().hydrateFor([NAMANGAN], false); // Fargona was taken away

    expect(store().selectedBranch).toEqual(NAMANGAN);
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

/**
 * The students page and the group card read a branch's status to decide
 * whether a Telegram registration link may be offered. It must come from the
 * CURRENT list: `refetchBranches` and `hydrateFor` replace `branches` but keep
 * the `selectedBranch` object they already had, so that copy can still carry a
 * status the server has since changed.
 */
describe("branchStatusIn — a branch's status as the list last reported it", () => {
  it("reads the status GET /branches returned (CEO)", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        { ...FARGONA, status: "ACTIVE" },
        { ...NAMANGAN, status: "CLOSED" },
      ],
    });
    useBranchSwitcher.setState({ canSelectAll: true });

    await store().fetchBranches();

    expect(branchStatusIn(store(), 1)).toBe("ACTIVE");
    expect(branchStatusIn(store(), 2)).toBe("CLOSED");
  });

  it("follows a refetch that changed the selected branch's status", async () => {
    localStorage.setItem(BRANCH_STORAGE_KEY, "2");
    useBranchSwitcher.setState({ canSelectAll: true });
    vi.mocked(api.get).mockResolvedValueOnce({
      data: [
        { ...FARGONA, status: "ACTIVE" },
        { ...NAMANGAN, status: "ACTIVE" },
      ],
    });
    await store().fetchBranches();

    vi.mocked(api.get).mockResolvedValueOnce({
      data: [
        { ...FARGONA, status: "ACTIVE" },
        { ...NAMANGAN, status: "INACTIVE" },
      ],
    });
    await store().refetchBranches();

    expect(store().selectedBranch?.id).toBe(2);
    expect(branchStatusIn(store(), 2)).toBe("INACTIVE");
  });

  it("follows a re-hydrate that changed a status (a non-CEO's token refresh)", () => {
    store().hydrateFor([{ ...NAMANGAN, status: "ACTIVE" }], false);

    store().hydrateFor([{ ...NAMANGAN, status: "ARCHIVED" }], false);

    expect(store().selectedBranch?.id).toBe(2);
    expect(branchStatusIn(store(), 2)).toBe("ARCHIVED");
  });

  it("is unknown for 'Barcha filiallar' and for a branch listed without a status", () => {
    // A sign-in cookie from before the payload carried branch status.
    store().hydrateFor([NAMANGAN], true);

    expect(branchStatusIn(store(), null)).toBeUndefined();
    expect(branchStatusIn(store(), 2)).toBeUndefined();
  });
});
