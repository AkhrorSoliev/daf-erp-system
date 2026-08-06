import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaLike = PrismaService | Prisma.TransactionClient;

type BranchBearer = {
  id: number;
  mainBranch: number | null;
  branches: { branchId?: number; branch?: { id: number } }[];
};

/**
 * May this caller act on this EMPLOYEE?
 *
 * The rule lived privately inside `UsersService` because `updateUser` was the
 * only thing that needed it — a Branch Director could pass another branch's
 * employee id and edit them, `password` included, so one branch's director
 * could take over the other branch's accounts. It moved here the moment a
 * second caller appeared (comments on an employee profile), because a rule
 * with two private copies is how `attendance.controller` came to be the only
 * guarded lesson module while three others manipulating the same lessons went
 * unchecked.
 *
 * OVERLAP, not equality: an Administrator may legitimately be attached to
 * several branches, and someone who works in both may edit staff in both.
 *
 * Fails closed at BOTH ends. A caller with no branch attached, and a target
 * with none, are each refused — the empty set is nothing, never everything.
 * The one deliberate consequence: a branch-level caller cannot edit a CEO,
 * who is branch-less by design. That is the correct answer.
 */
export function assertCallerMayTouchUserRecord(
  target: BranchBearer,
  caller: {
    mainBranch: number | null;
    branches: { branchId: number }[];
    roles: { role: { name: string } }[];
  },
  callerId: number,
  message = "Siz faqat o'z filialingiz xodimlarini tahrirlashingiz mumkin",
): void {
  if (target.id === callerId) return; // acting on yourself is always fine
  if (caller.roles.some((r) => r.role.name === 'CEO')) return;

  const callerBranches = new Set<number>([
    ...caller.branches.map((b) => b.branchId),
    ...(caller.mainBranch != null ? [caller.mainBranch] : []),
  ]);
  const targetBranches = new Set<number>([
    ...target.branches.map((b) => b.branch?.id ?? (b.branchId as number)),
    ...(target.mainBranch != null ? [target.mainBranch] : []),
  ]);

  const overlap = [...targetBranches].some((b) => callerBranches.has(b));
  if (callerBranches.size === 0 || targetBranches.size === 0 || !overlap) {
    throw new ForbiddenException(message);
  }
}

/**
 * The same rule, loading both sides itself — for callers that do not already
 * hold the target record.
 */
export async function assertCallerMayTouchUser(
  prisma: PrismaLike,
  callerId: number | undefined,
  targetUserId: number,
  message?: string,
): Promise<void> {
  if (callerId == null) {
    throw new ForbiddenException('Foydalanuvchi aniqlanmadi');
  }
  if (callerId === targetUserId) return;

  const caller = await prisma.user.findFirst({
    where: { id: callerId, deletedAt: null },
    select: {
      mainBranch: true,
      branches: { select: { branchId: true } },
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  if (!caller) throw new ForbiddenException('Foydalanuvchi topilmadi');

  const target = await prisma.user.findFirst({
    where: { id: targetUserId, deletedAt: null },
    select: {
      id: true,
      mainBranch: true,
      branches: { select: { branchId: true } },
    },
  });
  if (!target) throw new ForbiddenException('Xodim topilmadi');

  assertCallerMayTouchUserRecord(target, caller, callerId, message);
}
