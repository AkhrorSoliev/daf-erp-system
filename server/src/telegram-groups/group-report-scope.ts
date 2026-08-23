import type { ReportBranchIds } from '../common/finance/report-branch-scope';

/**
 * Which branches a Telegram group's reports may cover.
 *
 * The answer lives on the group and nowhere else. A group chat carries no
 * per-user ERP identity — that is why the report paths used to pass
 * `branchIds: null` and hand every approved group the whole company. But the
 * group itself already says what it is allowed to see: `approve()` refuses a
 * group that declares neither a branch nor `receivesAllBranches`
 * (`telegram-groups.service.ts`), and granting `receivesAllBranches` is
 * CEO-only. So an APPROVED group is always one of two things, and this maps
 * that fact onto the scope every report service already takes.
 *
 * It is the same rule `TelegramGroupBroadcastService` applies to events; the
 * reports were the half that never got it.
 */
export interface GroupReportScopeSource {
  branchId: number | null;
  receivesAllBranches: boolean;
}

export function reportBranchIdsForGroup(
  group: GroupReportScopeSource,
): ReportBranchIds {
  // A declared org-wide watcher. CEO-only, and additive by design.
  if (group.receivesAllBranches) return null;
  if (group.branchId != null) return [group.branchId];

  // Neither set. `approve()` has rejected this combination since branches
  // became mandatory, so it can only be a row approved before that — the era
  // when every group was born branch-less and silently received everything.
  // Keep that behaviour rather than narrowing an old group to nothing: going
  // quiet on a chat someone relies on is its own kind of breakage, and the
  // caller logs it so the row can be given a branch.
  return null;
}

/** True when the scope could not be derived and fell back to company-wide. */
export function isLegacyUnscopedGroup(group: GroupReportScopeSource): boolean {
  return !group.receivesAllBranches && group.branchId == null;
}

/**
 * Human label for the scope, used in report captions and as the Excel
 * `branchLabel`. A report that silently changed scope would be worse than one
 * that never had it — the reader has to be able to see which branches they are
 * looking at.
 */
export function branchLabelForGroup(
  group: GroupReportScopeSource,
  branchNames: Record<number, string>,
): string {
  if (group.receivesAllBranches || group.branchId == null) {
    return 'Barcha filiallar';
  }
  return branchNames[group.branchId] ?? `Filial #${group.branchId}`;
}
