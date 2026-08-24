"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useBranchChange } from "@/hooks/use-branch-change";
import { resetBranchScopedStores } from "@/lib/branch-scoped-stores";

/**
 * Drops every cached server response when the active branch changes.
 *
 * WHY THIS EXISTS: the branch now travels on every request (`X-Branch-Id`), but
 * React Query keys it by `queryKey`, not by request headers. Switching branch
 * changed WHAT the server would return while every cached entry stayed valid —
 * so pages kept rendering the previous branch's numbers until something else
 * happened to refetch them. With `staleTime: 5 * 60 * 1000` and
 * `refetchOnWindowFocus: false` (see `query-provider.tsx`), "something else"
 * could be five minutes away.
 *
 * REACT QUERY IS ONLY PART OF THE APP. 51 files fetch outside it, and clearing
 * the query cache did nothing for any of them — which is why the leads board
 * kept showing Fargona after a switch to Namangan until the user pressed
 * refresh. They are handled by their own shape:
 *
 *   - module-level zustand stores → `resetBranchScopedStores()` below; they
 *     outlive unmounts, so nothing else can clear them;
 *   - component-local `useState` + `useEffect` → `BranchScopedMain`, which
 *     remounts the page content so their effects re-run from scratch.
 *
 * The remount is driven by a `key` during render, not by this effect. What keeps
 * the two in step is this component's POSITION: it is rendered before
 * `{children}` in `query-provider.tsx`, so React queues its effect first and the
 * caches are empty by the time the fresh page fetches. That ordering is
 * documented where it is created — do not move this component below `children`.
 *
 * WHY CENTRAL RATHER THAN PER-KEY: only 8 of ~132 query keys mentioned the
 * branch. Adding it to the other 124 would fix today and miss tomorrow — every
 * new query would have to remember. This handles all of them, including pages
 * that never touch `useBranchSwitcher` and cannot know a switch happened.
 *
 * WHY `removeQueries` AND NOT ONLY `invalidateQueries`: invalidation marks
 * entries stale and refetches the ACTIVE ones, but inactive entries keep their
 * old data and are served instantly on the next mount — so navigating to a page
 * you visited before the switch would flash the other branch's figures. Removing
 * them means that page starts from a loading state, which is the honest thing to
 * show when the data genuinely is not known yet.
 *
 * `cancelQueries` runs first so an in-flight request issued under the OLD branch
 * cannot resolve after the switch and repopulate the cache with stale rows.
 */
export function BranchQuerySync() {
  const queryClient = useQueryClient();

  // "A switch happened" is defined once, in `useBranchChange` — including the
  // two traps (`null` is a selection; the first resolution is not a switch).
  // The global search dropdown needs exactly the same rule, and two copies of
  // it would be free to disagree.
  useBranchChange(() => {
    void queryClient.cancelQueries();
    queryClient.removeQueries();
    resetBranchScopedStores();
  });

  return null;
}
