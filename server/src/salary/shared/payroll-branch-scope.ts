import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * Which branch's payroll a caller may see or pay.
 *
 * - `all`    — CEO (and, by current policy, Administrator) span every branch.
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

/** Roles that legitimately span branches. */
const UNSCOPED_ROLES = ['CEO', 'Administrator'];

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
