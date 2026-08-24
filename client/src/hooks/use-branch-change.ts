"use client";

import { useEffect, useRef } from "react";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

/** Not-yet-resolved. `null` cannot serve — it is a real selection. */
type BranchState = number | null | undefined;

/**
 * Decide whether a branch VALUE change is a switch the app must react to.
 *
 * Pure so the rule can be tested without mounting React, and shared so there is
 * one definition of "the branch changed". There are two non-obvious cases and
 * both have cost a bug before:
 *
 *   - `null` is a real selection ("Barcha filiallar"), so it cannot double as
 *     "nothing chosen yet". The sentinel has to live outside the value space,
 *     which is why `previous` is `undefined` rather than `null` at boot.
 *   - The FIRST resolution after login is not a switch. Treating it as one
 *     throws away the initial page load's own in-flight requests — the page
 *     would blank out and refetch everything it had just asked for.
 */
export function resolveBranchSwitch(
  previous: BranchState,
  current: number | null,
): { switched: boolean; next: number | null } {
  if (previous === undefined) return { switched: false, next: current };
  return { switched: previous !== current, next: current };
}

/**
 * Run `onSwitch` when the user changes branch — never on the first resolution.
 *
 * WHO NEEDS THIS: anything holding branch-scoped state that `BranchScopedMain`
 * cannot reach. That remount covers the page content, which is most of the app,
 * but NOT what sits beside it in the dashboard layout — the header and sidebar
 * stay mounted on purpose, because the branch switcher lives there and must not
 * unmount itself mid-selection.
 *
 * `onSwitch` sits in the dependency array rather than behind a ref. A ref would
 * have to be written during render, which the React Compiler forbids — and it
 * buys nothing here: an inline arrow does re-arm the effect every render, but
 * the effect's first act is to ask whether the branch changed, and on a plain
 * re-render the answer is no. Re-running a no-op costs a comparison.
 */
export function useBranchChange(onSwitch: () => void): void {
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const loaded = useBranchSwitcher((s) => s.loaded);

  const previous = useRef<BranchState>(undefined);

  useEffect(() => {
    if (!loaded) return;
    const { switched, next } = resolveBranchSwitch(
      previous.current,
      selectedBranch?.id ?? null,
    );
    previous.current = next;
    if (switched) onSwitch();
  }, [selectedBranch, loaded, onSwitch]);
}
