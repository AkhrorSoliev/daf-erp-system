"use client";

import { useEffect, useRef } from "react";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

/** A `scopeVersion` value, or `undefined` before this caller has seen one. */
type ScopeState = number | undefined;

/**
 * Decide whether the branch scope changed since the caller last looked.
 *
 * Pure so the rule can be tested without mounting React, and shared so there is
 * one definition of "the branch changed". It reads the switcher's
 * `scopeVersion` — the SAME counter that keys `BranchScopedMain` — so the page
 * remount and the cache/store reset cannot disagree about what a switch is.
 *
 *   - The first value a caller sees is adopted, not reported: a caller that
 *     mounts after a switch has nothing stale to clear.
 *   - Any later change is a switch. That includes the FIRST resolution when it
 *     replaced the saved branch — e.g. a non-CEO right after login, whose first
 *     requests went out with no branch header (their whole scope). The version
 *     moves only then; resolving to the branch already saved leaves it alone,
 *     so a normal page load is not thrown away.
 */
export function resolveBranchSwitch(
  previous: ScopeState,
  current: number,
): { switched: boolean; next: number } {
  if (previous === undefined) return { switched: false, next: current };
  return { switched: previous !== current, next: current };
}

/**
 * Run `onSwitch` when the branch requests claim changes.
 *
 * WHO NEEDS THIS: anything holding branch-scoped state that `BranchScopedMain`
 * cannot reach. That remount covers the page content, which is most of the app,
 * but NOT what sits beside it in the dashboard layout — the header and sidebar
 * stay mounted on purpose, because the branch switcher lives there and must not
 * unmount itself mid-selection — nor the React Query cache and zustand stores
 * cleared by `BranchQuerySync`.
 *
 * `onSwitch` sits in the dependency array rather than behind a ref. A ref would
 * have to be written during render, which the React Compiler forbids — and it
 * buys nothing here: an inline arrow does re-arm the effect every render, but
 * the effect's first act is to ask whether the scope changed, and on a plain
 * re-render the answer is no. Re-running a no-op costs a comparison.
 */
export function useBranchChange(onSwitch: () => void): void {
  const scopeVersion = useBranchSwitcher((s) => s.scopeVersion);

  const previous = useRef<ScopeState>(undefined);

  useEffect(() => {
    const { switched, next } = resolveBranchSwitch(previous.current, scopeVersion);
    previous.current = next;
    if (switched) onSwitch();
  }, [scopeVersion, onSwitch]);
}
