"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

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
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const loaded = useBranchSwitcher((s) => s.loaded);

  // `null` is a real selection ("Barcha filiallar"), so it cannot double as
  // "nothing chosen yet" — the sentinel has to be outside the value space.
  const previous = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (!loaded) return;

    const current = selectedBranch?.id ?? null;

    // First resolution after login/hydration is not a switch. Clearing here
    // would throw away the initial page load's own requests.
    if (previous.current === undefined) {
      previous.current = current;
      return;
    }
    if (previous.current === current) return;

    previous.current = current;

    void queryClient.cancelQueries();
    queryClient.removeQueries();
  }, [selectedBranch, loaded, queryClient]);

  return null;
}
