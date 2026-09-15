"use client";

import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

/**
 * The dashboard's `<main>`, remounted whenever the branch requests claim
 * changes — a switch, or a first resolution that replaced the saved branch.
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
 * rows, typed form input) reset. That is the intended reading of a switch — a
 * deliberate change of context, not a filter tweak. Filters survive because
 * this codebase keeps them in the URL.
 *
 * WHICH IS WHY THE KEY IS `scopeVersion`, NOT THE SELECTION. The selection also
 * changes when the switcher first RESOLVES on page load, and keying on it (even
 * behind a "not loaded yet" sentinel) remounted every page once per hard load,
 * after `GET /branches` returned — wiping whatever had been typed by then and
 * repeating the page's first requests. `scopeVersion` bumps only when the
 * branch requests claim actually changes (`lib/branch-header.ts`,
 * `branchScopeChanged`).
 */
export function BranchScopedMain({ children }: { children: React.ReactNode }) {
  const scopeVersion = useBranchSwitcher((s) => s.scopeVersion);

  return (
    <main key={scopeVersion} className="min-w-0 flex-1 p-3 sm:p-6">
      {children}
    </main>
  );
}
