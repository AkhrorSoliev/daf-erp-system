import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * Which branch's payroll a caller may see or pay.
 *
 * - `all`    — CEO only. Every other role is confined.
 * - `branch` — confined to exactly one branch.
 * - `none`   — confined, but no branch is known. Sees and pays NOTHING.
 *
 * `none` is the whole point. Both payroll scopes used to collapse a missing
 * `mainBranch` into "no filter", which is fail-OPEN: a Branch Director whose
 * `mainBranch` was NULL could see — and `batchPay` — every branch's salaries.
 * Two Administrators were in exactly that state in production. Money paths
 * must fail closed: an unknown scope means nothing, not everything.
 */
export type PayrollBranchScope =
  | { kind: 'all' }
  | { kind: 'branch'; branchId: number }
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
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  if (!caller) return { kind: 'none' };

  const roleNames = caller.roles.map((r) => r.role.name);
  if (roleNames.some((r) => UNSCOPED_ROLES.includes(r))) return { kind: 'all' };

  return caller.mainBranch != null
    ? { kind: 'branch', branchId: caller.mainBranch }
    : { kind: 'none' };
}

/** Convenience for read queries: the branch filter, or undefined for `all`. */
export function scopeToBranchFilter(
  scope: PayrollBranchScope,
): number | undefined {
  return scope.kind === 'branch' ? scope.branchId : undefined;
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
  if (scope.kind === 'branch') {
    const mismatch =
      requestedBranchId != null && requestedBranchId !== scope.branchId;
    return { branchId: scope.branchId, blocked: mismatch };
  }
  // `all` — the CEO. The header is the only narrowing available, and `undefined`
  // (no pick) genuinely means every branch.
  return { branchId: requestedBranchId ?? undefined, blocked: false };
}
