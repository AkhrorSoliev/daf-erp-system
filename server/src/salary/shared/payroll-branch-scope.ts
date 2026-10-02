import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * Which branches' payroll a caller may see.
 *
 * - `all`      — CEO only. Every other role is confined.
 * - `branches` — confined to the branches attached to the caller: `mainBranch`
 *                plus every `UserBranch` row, sorted and unique. `mainBranch`
 *                is the home that answers when no branch is picked (`null`
 *                for someone attached through `UserBranch` alone, whose home
 *                is then the lowest attached branch).
 * - `none`     — confined, but no branch is known. Sees and pays NOTHING.
 *
 * `none` is the whole point. Both payroll scopes used to collapse a missing
 * `mainBranch` into "no filter", which is fail-OPEN: a Branch Director whose
 * `mainBranch` was NULL could see — and `batchPay` — every branch's salaries.
 * Two Administrators were in exactly that state in production. Money paths
 * must fail closed: an unknown scope means nothing, not everything.
 *
 * The set widens what a caller may SEE, not what they may pay: `payPayment`
 * and `batchPay` stay on `mainBranch`.
 */
export type PayrollBranchScope =
  | { kind: 'all' }
  | { kind: 'branches'; branchIds: number[]; mainBranch: number | null }
  | { kind: 'none' };

/**
 * Roles that legitimately span branches — the CEO, and only the CEO.
 *
 * Administrator used to sit here too, and the same `!CEO && !Administrator`
 * shape was repeated across payroll, cash accounts, debtors, outreach and call
 * logs. It contradicted D4/D6 (`docs/branch-decisions.md`): if every branch
 * computes its own P&L from its own income, costs and payroll, then every
 * employee below the CEO belongs to one branch and sees that branch. Batch 7
 * had already confined Administrators for attendance and cash, leaving the role
 * branch-confined in some modules and company-wide in others.
 *
 * A genuinely multi-branch Administrator is still supported — attach several
 * `UserBranch` rows and they act in each. That is the supported mechanism;
 * a blanket role exemption is not.
 */
const UNSCOPED_ROLES = ['CEO'];

export async function resolvePayrollBranchScope(
  prisma: PrismaLike,
  performedById: number,
  opts: { selfView?: boolean } = {},
): Promise<PayrollBranchScope> {
  // Looking at your own row is always allowed — an id-exact self lookup must
  // not come back empty because your UserBranch rows disagree with mainBranch.
  if (opts.selfView) return { kind: 'all' };

  const caller = await prisma.user.findUnique({
    where: { id: performedById },
    select: {
      mainBranch: true,
      branches: { select: { branchId: true } },
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  if (!caller) return { kind: 'none' };

  const roleNames = caller.roles.map((r) => r.role.name);
  if (roleNames.some((r) => UNSCOPED_ROLES.includes(r))) return { kind: 'all' };

  // The ceiling is the SET of attached branches — the same set the HTTP-level
  // `BranchScopeGuard` already confines the caller to. Sorted, so the fallback
  // home (the lowest attached branch) does not depend on the order the
  // database returns the `UserBranch` rows in.
  const branchIds = [
    ...new Set([
      ...caller.branches.map((b) => b.branchId),
      ...(caller.mainBranch != null ? [caller.mainBranch] : []),
    ]),
  ].sort((a, b) => a - b);
  return branchIds.length > 0
    ? { kind: 'branches', branchIds, mainBranch: caller.mainBranch }
    : { kind: 'none' };
}

/**
 * Intersect the caller's payroll scope with the branch they picked in the header.
 *
 * The scope is a CEILING; the request NARROWS within it — never the reverse.
 * This is the same rule `report-branch-scope.ts` enforces for money reports, and
 * it exists because the opposite let a Branch Director's workbook print one
 * branch on the cover and another branch's totals inside.
 *
 * `blocked` rather than a silent fallback: a caller confined to Fargona who asks
 * for Namangan must be REFUSED, not quietly served Fargona. Returning Fargona's
 * payroll under a header naming Namangan is how a report comes to lie about
 * whose money it is showing, and zeros would read as "this branch earned
 * nothing" — a different claim from "you may not look".
 *
 * A caller attached to several branches is served whichever of them they pick.
 * While only `mainBranch` counted, a director who picked their second branch was
 * refused, the payroll leg of that branch's net profit read 0 and the profit
 * looked too high. With no pick they get their home branch, so a caller who
 * sends no branch sees one branch's payroll beside every branch's revenue; the
 * header switcher always sends a branch for non-CEO users.
 *
 * Lives here rather than inline in one caller because both payroll entry points
 * need it: `resolveMonthlyScope` (the /payments/salary report) and
 * `SalaryOverviewService` (the ⚙ Sozlamalar rate list). They had drifted once
 * already — `/salary/monthly` honoured the header and `/salary/overview` did
 * not, so a CEO switching branch saw one of the two change.
 *
 * @param requestedBranchId the header selection, already intersected with the
 *   caller's HTTP-level ceiling by `BranchScopeGuard`
 */
export function narrowPayrollScope(
  scope: PayrollBranchScope,
  requestedBranchId: number | undefined,
): { branchId: number | undefined; blocked: boolean } {
  if (scope.kind === 'none') {
    return { branchId: undefined, blocked: true };
  }
  if (scope.kind === 'branches') {
    // The resolver turns an empty set into `none`; a hand-built one is blocked
    // too, because `branchId: undefined, blocked: false` would mean "every branch".
    if (scope.branchIds.length === 0) {
      return { branchId: undefined, blocked: true };
    }
    // Home: `mainBranch`, else the lowest attached branch (`branchIds` is sorted).
    const home = scope.mainBranch ?? scope.branchIds[0];
    if (requestedBranchId == null) return { branchId: home, blocked: false };
    return scope.branchIds.includes(requestedBranchId)
      ? { branchId: requestedBranchId, blocked: false }
      : { branchId: home, blocked: true };
  }
  // `all` — the CEO. The header is the only narrowing available, and `undefined`
  // (no pick) genuinely means every branch.
  return { branchId: requestedBranchId ?? undefined, blocked: false };
}
