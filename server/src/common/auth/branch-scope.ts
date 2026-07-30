import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * Which branches a caller may act on.
 *
 * A `@Roles()` guard proves the caller HAS a role; it says nothing about whether
 * the record they addressed by id is theirs. With one branch that gap was
 * invisible — `companyId` was effectively the boundary. With two, an admin of
 * one branch can reach into the other unless every id-addressed operation
 * checks the record's branch.
 *
 * `mainBranch` and `UserBranch` are both consulted because different parts of
 * the system historically wrote one or the other.
 *
 * A CEO deliberately has no branch (see the CEO-branch-access rule) and spans
 * everything. Everyone else is confined to the branches actually attached to
 * them — an employee belongs to exactly one branch, so in practice this is one.
 */
export type CallerBranchScope =
  | { kind: 'all' }
  | { kind: 'branches'; branchIds: number[] };

export async function resolveCallerBranchScope(
  prisma: PrismaLike,
  userId: number | undefined,
): Promise<CallerBranchScope> {
  if (userId == null) {
    throw new ForbiddenException('Foydalanuvchi aniqlanmadi');
  }
  const caller = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      mainBranch: true,
      branches: { select: { branchId: true } },
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  if (!caller) throw new ForbiddenException('Foydalanuvchi topilmadi');

  if (caller.roles.some((r) => r.role.name === 'CEO')) return { kind: 'all' };

  const branchIds = [
    ...new Set<number>([
      ...caller.branches.map((b) => b.branchId),
      ...(caller.mainBranch != null ? [caller.mainBranch] : []),
    ]),
  ];
  // A non-CEO with no branch attached spans nothing rather than everything:
  // an unknown scope must never read as "all" on a path that moves money.
  return { kind: 'branches', branchIds };
}

/**
 * Throw unless the caller may act on `branchId`.
 *
 * Use on every operation addressed by an entity id whose branch the caller did
 * not choose — attendance for a group, a movement on a cash account, and so on.
 */
export async function assertCallerInBranch(
  prisma: PrismaLike,
  userId: number | undefined,
  branchId: number,
  message = "Bu boshqa filialga tegishli — sizda ruxsat yo'q",
): Promise<void> {
  const scope = await resolveCallerBranchScope(prisma, userId);
  if (scope.kind === 'all') return;
  if (!scope.branchIds.includes(branchId)) {
    throw new ForbiddenException(message);
  }
}
