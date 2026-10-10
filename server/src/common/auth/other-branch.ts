import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import {
  studentBranchWhere,
  type ReportBranchIds,
} from '../finance/report-branch-scope';

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

/**
 * ADR-0063 for a student card: named when it sits in another branch the
 * caller may open, a plain 404 otherwise. Shared by the debt and the
 * refundable drawers.
 */
export async function studentNotFound(
  db: { student: Pick<PrismaClient['student'], 'findFirst'> },
  companyId: number,
  id: number,
  scope: ReportBranchIds,
  ceiling: ReportBranchIds,
): Promise<NotFoundException> {
  if (ceilingIsWider(scope, ceiling)) {
    const elsewhere = await db.student.findFirst({
      where: { id, companyId, deletedAt: null, ...studentBranchWhere(ceiling) },
      select: {
        branches: {
          where: ceiling === null ? {} : { branchId: { in: ceiling } },
          select: { branch: { select: { id: true, name: true } } },
          orderBy: { branchId: 'asc' },
          take: 1,
        },
      },
    });
    const branch = elsewhere?.branches[0]?.branch;
    if (branch) return inOtherBranch("o'quvchi", branch);
  }
  return new NotFoundException("O'quvchi topilmadi");
}
