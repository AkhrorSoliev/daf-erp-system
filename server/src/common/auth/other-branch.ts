import { NotFoundException } from '@nestjs/common';
import type { ReportBranchIds } from '../finance/report-branch-scope';

/**
 * True when the caller may open branches the selected scope leaves out — only
 * then can a record missing from the scope be in another branch of theirs.
 */
export function ceilingIsWider(
  scope: ReportBranchIds,
  ceiling: ReportBranchIds,
): boolean {
  return (
    scope !== null &&
    (ceiling === null || ceiling.some((b) => !scope.includes(b)))
  );
}

/**
 * The 404 of a record that exists in another branch the caller may open.
 * Detail pages filter by the switcher's branch, and a bare «topilmadi» there
 * reads as "does not exist": on 01.10.2026 a CEO in Farg'ona cancelled eight
 * Namangan lessons on it (ADR-0063). The client switches branch from `branch`.
 */
export function inOtherBranch(
  what: string,
  branch: { id: number; name: string },
): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    error: 'Not Found',
    message: `Bu ${what} «${branch.name}» filialiga tegishli. Ko'rish uchun shu filialni tanlang.`,
    branch,
  });
}
