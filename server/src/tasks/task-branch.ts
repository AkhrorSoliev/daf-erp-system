import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { CallerBranchScope } from '../common/auth/branch-scope';
import {
  tryResolveStudentBranchId,
  tryResolveUserBranchId,
} from '../common/finance/resolve-branch';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Spec §3.1: the entity's branch, else the author's header pick, else null.
 * A pick outside the caller's scope is refused rather than silently widened.
 */
export async function resolveTaskBranchId(
  db: Db,
  args: {
    companyId: number;
    entityType?: string;
    entityId?: string;
    headerBranchId: number | null;
    callerScope: CallerBranchScope;
  },
): Promise<number | null> {
  const { entityType, entityId } = args;
  if (entityType && entityId) {
    switch (entityType) {
      case 'Student':
        return tryResolveStudentBranchId(db, Number(entityId), args.companyId);
      case 'Group': {
        const g = await db.group.findFirst({
          where: { id: entityId },
          select: { branchId: true },
        });
        return g?.branchId ?? null;
      }
      case 'Lead': {
        const l = await db.lead.findFirst({
          where: { id: entityId },
          select: { branchId: true },
        });
        return l?.branchId ?? null;
      }
      case 'User':
        return tryResolveUserBranchId(db, Number(entityId));
    }
  }
  if (args.headerBranchId === null) {
    return args.callerScope.kind === 'branches' &&
      args.callerScope.branchIds.length === 1
      ? args.callerScope.branchIds[0]
      : null;
  }
  if (
    args.callerScope.kind === 'branches' &&
    !args.callerScope.branchIds.includes(args.headerBranchId)
  ) {
    throw new ForbiddenException('Bu filial sizga tegishli emas');
  }
  return args.headerBranchId;
}
