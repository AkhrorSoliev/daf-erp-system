"use client";

import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { branchScopeKey } from "@/lib/branch-header";

/**
 * The dashboard's `<main>`, remounted whenever the active branch changes.
 *
 * WHY: about 47 components fetch with `useState` + `useEffect` + `api.get`
 * rather than React Query — students, teachers, groups, every settings page,
 * every profile page, both attendance views. `BranchQuerySync` clears the query
 * cache, which those components never consult, so a branch switch left them
 * rendering the previous branch's rows until the user pressed refresh.
 *
 * Adding a branch dependency to each of their effects would fix today and miss
 * tomorrow — the same argument that made `BranchQuerySync` central rather than
 * per-key. Changing the `key` here unmounts the whole page subtree, so every
 * mount-time effect re-runs from scratch, including in components written after
 * this one by someone who never heard of the branch switcher.
 *
 * WHAT THIS DELIBERATELY DOES NOT COVER: module-level zustand stores. They
 * outlive the unmount by design, and two of them additionally guard against
 * refetching (`loaded`, `loadedSections`), so a remount would show the previous
 * branch's board and then decline to reload it. Those are reset explicitly —
 * see `lib/branch-scoped-stores.ts`.
 *
 * The branch switcher itself lives in `DashboardHeader`, OUTSIDE this element,
 * so it is never torn down by its own selection.
 *
 * COST: scroll position and component-local UI state (open dialogs, expanded
 * rows) reset. That is the intended reading of the action — switching branch is
 * a deliberate change of context, not a filter tweak. Filters survive because
 * this codebase keeps them in the URL.
 */
export function BranchScopedMain({ children }: { children: React.ReactNode }) {
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const loaded = useBranchSwitcher((s) => s.loaded);

  // Pure and tested in `lib/branch-header.ts` — the sentinel it returns before
  // the branch resolves is the difference between "remount on every switch" and
  // "remount every page once on first paint, discarding the initial load".
  const key = branchScopeKey(selectedBranch, loaded);

  return (
    <main key={key} className="min-w-0 flex-1 p-3 sm:p-6">
      {children}
    </main>
  );
}
