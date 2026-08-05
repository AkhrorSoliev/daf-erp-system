/**
 * Module-level stores that must be emptied when the active branch changes.
 *
 * WHY THIS EXISTS: `BranchQuerySync` drops the React Query cache on a branch
 * switch, which covers every `useQuery` in the app. But roughly 51 files fetch
 * OUTSIDE React Query, and they split into two failure shapes:
 *
 *   - component-local `useState` + `useEffect` (~47 files) — these die with the
 *     component, so remounting the page content is enough (`BranchScopedMain`);
 *   - **zustand stores (3)** — these live at MODULE level. They survive the
 *     remount, the unmount, and the route change. Nothing short of an explicit
 *     reset clears them.
 *
 * The second shape is what made switching from Fargona to Namangan leave the
 * leads board showing Fargona's columns until a manual page refresh: the store
 * still held the old board, and `fetchSectionLeads` short-circuits on
 * `loadedSections.has(sectionId)`, so even the refetch it did run skipped every
 * section already loaded under the previous branch.
 *
 * WHY A REGISTRY RATHER THAN A LIST IN `BranchQuerySync`: a store registers
 * itself, next to its own definition, where the person adding one is looking.
 * `branch-scoped-stores.test.ts` fails when a new fetching store appears under
 * `src/hooks` and is neither registered here nor declared branch-independent —
 * so the next store cannot quietly reintroduce this bug.
 */

/** The zustand surface we need — kept structural so tests can use a fake. */
interface ResettableStore<T> {
  setState: (partial: T, replace: true) => void;
  getInitialState: () => T;
}

const stores = new Set<() => void>();

/**
 * Register a store to be emptied on branch change.
 *
 * The reset restores `getInitialState()` — the object zustand built from the
 * store's own initializer — so it can never drift out of sync with the store's
 * shape the way a hand-written list of fields would. That relies on the state
 * objects never being mutated in place, which zustand already requires for
 * re-rendering to work at all: always `new Set(prev).add(x)`, never
 * `prev.add(x)`.
 *
 * Call at module scope, right below the store. A store that has never been
 * imported holds no data, so it has nothing to go stale.
 *
 * @returns an unregister function (for tests; production never unregisters)
 */
export function registerBranchScopedStore<T>(store: ResettableStore<T>) {
  const reset = () => store.setState(store.getInitialState(), true);
  stores.add(reset);
  return () => {
    stores.delete(reset);
  };
}

/** Empty every registered store. Called by `BranchQuerySync` on a switch. */
export function resetBranchScopedStores() {
  for (const reset of stores) reset();
}

/** How many stores are registered — for the coverage test. */
export function registeredBranchScopedStoreCount() {
  return stores.size;
}
