import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  registerBranchScopedStore,
  registeredBranchScopedStoreCount,
  resetBranchScopedStores,
} from "./branch-scoped-stores";

/**
 * Switching from Fargona to Namangan left the leads board showing Fargona's
 * columns until the user pressed refresh.
 *
 * `BranchQuerySync` clears the React Query cache, but the leads board is a
 * module-level zustand store — it holds its data outside React entirely, so
 * unmounting the page, changing route and clearing the query cache all leave it
 * untouched. Worse, `fetchSectionLeads` short-circuits on
 * `loadedSections.has(sectionId)`, so even a fresh mount declined to reload the
 * sections it had already loaded under the previous branch.
 */
describe("branch-scoped store registry", () => {
  /** Minimal stand-in for a zustand store: state + the two methods we call. */
  function fakeStore<T extends object>(initial: T) {
    let state = initial;
    return {
      setState: (partial: T, _replace: true) => {
        state = partial;
      },
      getInitialState: () => initial,
      current: () => state,
    };
  }

  it("restores a store to its initial state", () => {
    const store = fakeStore({ board: [] as string[], loaded: false });
    const unregister = registerBranchScopedStore(store);

    store.setState({ board: ["fargona"], loaded: true }, true);
    expect(store.current().board).toEqual(["fargona"]);

    resetBranchScopedStores();

    expect(store.current().board).toEqual([]);
    expect(store.current().loaded).toBe(false);
    unregister();
  });

  it("clears the guards that would otherwise SKIP the refetch", () => {
    // The actual defect. `loaded: true` (mock exams) and a populated
    // `loadedSections` (leads) both mean "already have this — don't fetch". Left
    // set across a branch switch, they turn a stale board into a permanent one.
    const store = fakeStore({
      loadedSections: new Set<string>(),
      loaded: false,
    });
    const unregister = registerBranchScopedStore(store);

    store.setState(
      { loadedSections: new Set(["sec-fargona"]), loaded: true },
      true,
    );
    resetBranchScopedStores();

    expect(store.current().loadedSections.size).toBe(0);
    expect(store.current().loaded).toBe(false);
    unregister();
  });

  it("resets every registered store, not just the first", () => {
    const a = fakeStore({ n: 0 });
    const b = fakeStore({ n: 0 });
    const ua = registerBranchScopedStore(a);
    const ub = registerBranchScopedStore(b);

    a.setState({ n: 1 }, true);
    b.setState({ n: 2 }, true);
    resetBranchScopedStores();

    expect(a.current().n).toBe(0);
    expect(b.current().n).toBe(0);
    ua();
    ub();
  });

  it("unregisters cleanly", () => {
    const before = registeredBranchScopedStoreCount();
    const unregister = registerBranchScopedStore(fakeStore({ n: 0 }));
    expect(registeredBranchScopedStoreCount()).toBe(before + 1);
    unregister();
    expect(registeredBranchScopedStoreCount()).toBe(before);
  });
});

/**
 * The mechanism that stops the NEXT store from reintroducing the bug.
 *
 * A zustand store that fetches its own data is invisible to both other layers:
 * `BranchQuerySync` only knows React Query, and `BranchScopedMain` only remounts
 * components — module state survives it. So every such store must either
 * register or be named here as branch-independent, with the reason.
 */
describe("every fetching zustand store is accounted for", () => {
  /**
   * Stores that legitimately ignore the branch. Each entry is a claim that
   * survives review: the data is not scoped by branch at all.
   */
  const BRANCH_INDEPENDENT: Record<string, string> = {
    "use-branch-switcher.ts":
      "IS the switcher — resetting it would clear the selection that triggered the reset",
    "use-notifications.ts":
      "notifications are addressed to a USER, not a branch; the unread badge must not blank out on a switch",
    "use-push-notifications.ts":
      "browser push subscription — a device concern, no server rows",
  };

  const hooksDir = join(__dirname, "..", "hooks");

  const fetchingStores = readdirSync(hooksDir)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => {
      const src = readFileSync(join(hooksDir, f), "utf8");
      return src.includes('from "zustand"') && /api\.(get|post|patch|delete)/.test(src);
    });

  it("finds the zustand stores (guards against the glob silently matching nothing)", () => {
    expect(fetchingStores.length).toBeGreaterThan(0);
  });

  it.each(fetchingStores)("%s registers or is declared branch-independent", (file) => {
    const src = readFileSync(join(hooksDir, file), "utf8");
    const registers = src.includes("registerBranchScopedStore(");
    const declared = file in BRANCH_INDEPENDENT;

    expect(
      registers || declared,
      `${file} is a module-level zustand store that fetches from the API, so a ` +
        `branch switch leaves its data stale — nothing else can clear it. Either ` +
        `call registerBranchScopedStore(<store>) below its definition, or add it ` +
        `to BRANCH_INDEPENDENT in this file with the reason it ignores the branch.`,
    ).toBe(true);

    // Both is a contradiction: it either follows the branch or it does not.
    expect(registers && declared).toBe(false);
  });
});
