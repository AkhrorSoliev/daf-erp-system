import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * Canonical "which branch does this money belong to?" resolvers.
 *
 * WHY THIS EXISTS: every financial row must carry a branch, otherwise no report
 * filter can ever recover it — a `branchId = null` ledger row is silently
 * dropped from every per-branch total, so `Σ(branches)` stops equalling the
 * company total. Before this helper, each write site resolved (or forgot to
 * resolve) the branch on its own, which is how ~8 900 branch-less transactions
 * accumulated.
 *
 * BUSINESS RULES (docs/branch-decisions.md):
 *   D5 — a student belongs to exactly one branch at a time.
 *   D6 — an employee belongs to exactly one branch.
 * Both make the lookups below deterministic rather than best-effort.
 *
 * STUDENT PRIORITY — `StudentBranch` first, active enrollment second.
 * `StudentBranch` is what every read path filters on (`/students?branch_id=`,
 * debtors, balance sheet), so attributing money the same way is what keeps the
 * books and the lists agreeing. The enrollment fallback only covers a student
 * whose branch row is missing.
 */
export async function tryResolveStudentBranchId(
  db: PrismaLike,
  studentId: number,
  companyId: number,
): Promise<number | null> {
  const studentBranch = await db.studentBranch.findFirst({
    where: { studentId, student: { companyId } },
    select: { branchId: true },
    orderBy: { branchId: 'asc' },
  });
  if (studentBranch) return studentBranch.branchId;

  const activeEnrollment = await db.enrollment.findFirst({
    where: {
      studentId,
      deletedAt: null,
      status: 'ACTIVE',
      group: { companyId, deletedAt: null },
    },
    select: { group: { select: { branchId: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return activeEnrollment?.group?.branchId ?? null;
}

/**
 * Fail-closed variant — throws when the branch cannot be determined.
 *
 * Use this on any path that writes money. Returning null there would write
 * another unrecoverable branch-less ledger row; a loud failure is cheaper than
 * a silent one, because the row can never be reliably re-attributed once a
 * second branch has data.
 */
export async function resolveStudentBranchId(
  db: PrismaLike,
  studentId: number,
  companyId: number,
): Promise<number> {
  const branchId = await tryResolveStudentBranchId(db, studentId, companyId);
  if (branchId == null) {
    throw new Error(
      `O'quvchi #${studentId} uchun filial aniqlanmadi — moliyaviy yozuv filialsiz yozilmaydi. ` +
        `O'quvchiga filial biriktiring.`,
    );
  }
  return branchId;
}

/**
 * Employee branch. D6 gives every employee exactly one branch, so `mainBranch`
 * and the single `UserBranch` row agree; `mainBranch` is preferred because it
 * is the field payroll scoping already reads.
 *
 * CEOs are deliberately branch-less (they span all branches), so this returns
 * null for them rather than inventing a branch — callers that write money for a
 * CEO must supply the branch explicitly.
 */
export async function tryResolveUserBranchId(
  db: PrismaLike,
  userId: number,
): Promise<number | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      mainBranch: true,
      branches: { select: { branchId: true }, orderBy: { branchId: 'asc' } },
    },
  });
  if (!user) return null;
  if (user.mainBranch != null) return user.mainBranch;
  return user.branches.length === 1 ? user.branches[0].branchId : null;
}
