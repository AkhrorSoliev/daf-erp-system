import { ROLE_BRANCH_DIRECTOR, ROLE_CEO } from "../dashboard-home-visibility";
import type { BranchReadiness } from "./launch-types";

export type LaunchVisibility = "hidden" | "journey" | "celebrate";

/**
 * The card is seen by the CEO and a branch director. The `readiness` endpoint
 * is also open only to them — a request from anyone else triggers a global
 * 403 toast — so this function also decides whether to enable the request.
 */
export function canSeeLaunchJourney(roleIds: number[]): boolean {
  return roleIds.includes(ROLE_CEO) || roleIds.includes(ROLE_BRANCH_DIRECTOR);
}

/**
 * The card's three states (spec §4.4):
 * - `journey` — the branch has not launched yet;
 * - `celebrate` — it launched and this user has seen the card before;
 * - `hidden` — every other case. On a branch that was already running
 *   (Farg'ona) the card was never seen, so no celebration shows either.
 *
 * Once `flags.launched` has latched (see `launch-storage.ts`), it settles the
 * whole answer by itself — `readiness` is not consulted at all. This is what
 * makes "never flip back" hold even against a stale `launched: false`
 * response: a race that refetches readiness after the flag latched must not
 * resurrect the `journey` map for a branch that has already launched.
 */
export function resolveLaunchVisibility(input: {
  roleIds: number[];
  selectedBranchId: number | null;
  readiness: BranchReadiness | undefined;
  flags: { seen: boolean; celebrated: boolean; launched: boolean };
}): LaunchVisibility {
  const { roleIds, selectedBranchId, readiness, flags } = input;
  if (!canSeeLaunchJourney(roleIds)) return "hidden";
  // CEO on "All branches": which branch's journey this is is ambiguous.
  if (selectedBranchId === null) return "hidden";
  if (flags.launched) {
    return flags.seen && !flags.celebrated ? "celebrate" : "hidden";
  }
  // The request failed, or an old server — the helper stays quiet.
  if (!readiness || typeof readiness.launched !== "boolean") return "hidden";
  if (readiness.branchId !== selectedBranchId) return "hidden";
  if (!readiness.launched) return "journey";
  if (flags.seen && !flags.celebrated) return "celebrate";
  return "hidden";
}
