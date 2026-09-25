import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { grantableRoleIdsFor } from '../../telegram/constants';

type PrismaLike = PrismaService | Prisma.TransactionClient;

type BranchBearer = {
  id: number;
  mainBranch: number | null;
  branches: { branchId?: number; branch?: { id: number } }[];
};

type CallerRecord = {
  mainBranch: number | null;
  branches: { branchId: number }[];
  roles: { role: { name: string } }[];
};

const callerSelect = {
  mainBranch: true,
  branches: { select: { branchId: true } },
  roles: { select: { role: { select: { name: true } } } },
} satisfies Prisma.UserSelect;

const OUTRANKED_MESSAGE =
  "Bu xodim sizdan yuqori yoki siz bilan bir darajada — uning hisobini faqat sizdan yuqori rahbar o'zgartiradi";
const OWN_STATUS_MESSAGE =
  "O'z holatingizni o'zgartira olmaysiz — buni sizdan yuqori rahbar qiladi";

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
  caller: CallerRecord,
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
    select: callerSelect,
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

export type ManageUserOptions = {
  /** The refusal text when the caller shares no branch with the employee. */
  message?: string;
  /** The write changes the account's status. Archiving counts. */
  changesStatus?: boolean;
};

/**
 * May this caller WRITE to this employee's account? (ADR-0027)
 *
 * Reading and annotating an employee need a shared branch and nothing more;
 * that is `assertCallerMayTouchUserRecord`, and comments and history still use
 * it. Writing needs RANK as well, because branch overlap alone let an
 * Administrator set the password, phone or status of their own Branch
 * Director, and of any CEO who has a branch attached (four CEO accounts in
 * production do). A phone number is a credential here: Telegram sign-in finds
 * the account by it and asks for no password.
 *
 * - **Rank is the grant ceiling.** A non-CEO may write only to an account
 *   whose every role lies inside `grantableRoleIdsFor(their roles)`, the map
 *   that decides which roles they may hand out (ADR-0026). One map, no second
 *   hierarchy: an Administrator manages Teachers, Cashiers and role-less
 *   staff; a Branch Director also manages Administrators; peers and superiors
 *   are the business of someone above them.
 * - **The whole account, not a list of sensitive fields.** Name, phone,
 *   status, branches, archive: a field added to the form later is covered
 *   without anyone having to classify it.
 * - **A caller with an empty ceiling manages nobody**, not even a role-less
 *   employee, whose empty role list would otherwise pass vacuously.
 * - **Yourself:** no branch or rank check, but your own status is set by
 *   someone above you. A CEO spans everything.
 */
export function assertCallerMayManageUserRecord(
  target: BranchBearer & { roles: { role: { id: number } }[] },
  caller: CallerRecord,
  callerId: number,
  opts: ManageUserOptions = {},
): void {
  const callerIsCeo = caller.roles.some((r) => r.role.name === 'CEO');
  if (target.id === callerId) {
    if (opts.changesStatus && !callerIsCeo) {
      throw new ForbiddenException(OWN_STATUS_MESSAGE);
    }
    return;
  }
  if (callerIsCeo) return;

  assertCallerMayTouchUserRecord(target, caller, callerId, opts.message);

  const ceiling = grantableRoleIdsFor(caller.roles.map((r) => r.role.name));
  const outranksTarget =
    ceiling.length > 0 &&
    target.roles.every((r) => ceiling.includes(r.role.id));
  if (!outranksTarget) throw new ForbiddenException(OUTRANKED_MESSAGE);
}

/**
 * The write rule, loading both sides itself. The caller is read from the
 * database with `deletedAt: null`: an access token outlives an archive by up
 * to an hour, and nothing else re-reads the account on each request.
 */
export async function assertCallerMayManageUser(
  prisma: PrismaLike,
  callerId: number | undefined,
  targetUserId: number,
  opts: ManageUserOptions = {},
): Promise<void> {
  if (callerId == null) {
    throw new ForbiddenException('Foydalanuvchi aniqlanmadi');
  }
  // Editing yourself needs no lookup, unless the status changes: that rule
  // reads the caller's roles.
  if (callerId === targetUserId && !opts.changesStatus) return;

  const caller = await prisma.user.findFirst({
    where: { id: callerId, deletedAt: null },
    select: callerSelect,
  });
  if (!caller) throw new ForbiddenException('Foydalanuvchi topilmadi');

  const target = await prisma.user.findFirst({
    where: { id: targetUserId, deletedAt: null },
    select: {
      id: true,
      mainBranch: true,
      branches: { select: { branchId: true } },
      roles: { select: { role: { select: { id: true } } } },
    },
  });
  if (!target) throw new ForbiddenException('Xodim topilmadi');

  assertCallerMayManageUserRecord(target, caller, callerId, opts);
}
