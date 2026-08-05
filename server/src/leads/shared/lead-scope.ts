import { Prisma } from '@prisma/client';
import { ReportBranchIds } from '../../common/finance/report-branch-scope';

/**
 * The branch predicate for a Lead.
 *
 * Leads differ from students and groups in one way that matters: a lead arrives
 * from a public form or a cold call BEFORE anyone knows which branch they will
 * study at. `Lead.branchId` is therefore nullable, and null means "not yet
 * assigned" — an unassigned pool every branch can work, not hidden data.
 *
 * So the predicate is `mine OR unassigned`, not `mine`. Excluding the null
 * bucket would make new public-form leads invisible to everyone and the funnel
 * would silently stop working; including OTHER branches' leads is what the
 * column was added to prevent. Existing leads were backfilled to branch 1 in the
 * migration precisely so that they do not sit in this shared pool.
 *
 * The branch becomes mandatory at conversion — `LeadsService.convert` already
 * refuses without one, because a branch-less student can take no payment.
 */
export function leadBranchWhere(
  ids: ReportBranchIds | undefined,
): Prisma.LeadWhereInput {
  if (ids == null) return {};
  return { OR: [{ branchId: { in: ids } }, { branchId: null }] };
}

/**
 * The same branch, but for COUNTING — unassigned leads excluded.
 *
 * Visibility and attribution are different questions and the answer differs.
 * `leadBranchWhere` deliberately includes `branchId = null` so an unassigned
 * lead is workable from either branch. Feeding that same predicate into a
 * per-branch COUNT would add every unassigned lead to Fargona's total AND to
 * Namangan's, so `Σ(branches)` would exceed the company figure and the
 * conversion rate would be wrong in both.
 *
 * So: counts use this. The unassigned leads are reported as their own bucket,
 * which keeps
 *
 *     Σ(branch counts) + unassigned == company count
 *
 * true — the same shape as the financial invariant in
 * `common/finance/unassigned-branch.spec.ts`.
 */
export function leadAttributionWhere(
  ids: ReportBranchIds | undefined,
): Prisma.LeadWhereInput {
  return ids == null ? {} : { branchId: { in: ids } };
}

/** The unassigned bucket itself, for reporting it explicitly. */
export function leadUnassignedWhere(): Prisma.LeadWhereInput {
  return { branchId: null };
}
