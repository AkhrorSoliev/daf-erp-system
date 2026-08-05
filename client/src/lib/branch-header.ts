/**
 * Which branch the client claims on a request, and which saved selection is
 * still legal for the signed-in user.
 *
 * Extracted as pure functions so both can be tested without axios, cookies or a
 * DOM. They decide what data every page asks for, so a silent mistake here
 * looks like "this branch is empty" rather than like a bug.
 */

/** Key the branch switcher persists to. */
export const BRANCH_STORAGE_KEY = "branchId";

/** The switcher's "Barcha filiallar" (all branches) selection. */
export const ALL_BRANCHES = "all";

/**
 * The `X-Branch-Id` value for a stored selection, or `null` to send no header.
 *
 * "No header" and "all branches" are the same wire state on purpose: the server
 * reads an absent branch as "no pick", which resolves to the caller's full
 * scope — every branch for a CEO, their own branches for anyone else. There is
 * no header value that could WIDEN a caller's scope, which is why the client is
 * allowed to send this unconditionally.
 */
export function branchHeaderValue(stored: string | null): string | null {
  if (!stored) return null;
  if (stored === ALL_BRANCHES) return null;
  return stored;
}

export interface BranchOption {
  id: number;
}

/** What the switcher has resolved to, if anything. */
export const BRANCH_KEY_BOOT = "boot";

/**
 * The React `key` that scopes the dashboard's page content to a branch.
 *
 * `BranchScopedMain` puts this on `<main>`, so a change unmounts the whole page
 * subtree and every mount-time effect runs again. That is what reloads the ~47
 * components that fetch with `useState` + `useEffect` instead of React Query —
 * they never consult the query cache, so clearing it did nothing for them, and a
 * branch switch left them showing the previous branch's rows until the user
 * pressed refresh.
 *
 * Two values must not collide, which is why this is a function and not
 * `String(id)`:
 *
 *   - `null` is a real selection ("Barcha filiallar"), not "nothing chosen";
 *   - before the branch list resolves there is no selection at all, and keying
 *     on the unresolved value would remount every page once on first paint,
 *     throwing away the initial load's own in-flight requests.
 *
 * So "not resolved yet" gets a sentinel OUTSIDE the id space, and the first real
 * resolution is the first key change — which is a no-op, because the page
 * mounting for the first time has nothing stale to discard.
 */
export function branchScopeKey(
  selectedBranch: BranchOption | null,
  loaded: boolean,
): string {
  if (!loaded) return BRANCH_KEY_BOOT;
  return selectedBranch ? String(selectedBranch.id) : ALL_BRANCHES;
}

/**
 * Restore a persisted selection, dropping it when it is no longer legal.
 *
 * The saved value was never checked against the current user's branches, so
 * signing in as someone else on the same machine left the header naming a
 * branch that user cannot see. The server refuses that data (empty scope),
 * which renders as an empty page — a confusing way to find out.
 *
 * @param canSelectAll whether the caller may choose "Barcha filiallar" (CEO)
 */
export function resolveStoredBranch<T extends BranchOption>(
  stored: string | null,
  branches: T[],
  canSelectAll: boolean,
): T | null {
  if (stored === ALL_BRANCHES) {
    // A non-CEO carrying a stale "all" falls back to their own branch rather
    // than to a consolidated view they are not entitled to.
    return canSelectAll ? null : (branches[0] ?? null);
  }

  const saved = stored ? branches.find((b) => b.id === Number(stored)) : undefined;
  if (saved) return saved;

  // Nothing usable saved: a CEO defaults to the consolidated view, everyone
  // else to their (usually only) branch.
  return canSelectAll ? null : (branches[0] ?? null);
}
