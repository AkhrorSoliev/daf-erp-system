import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SIGN_IN_USER_STATUSES } from '../common/auth/blocked-user';
import { canAssignTo, canWatch, type PolicyPerson } from './task-policy';

const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  photo: true,
  telegramChatId: true,
  roles: { select: { role: { select: { id: true, name: true } } } },
  branches: { select: { branchId: true } },
  mainBranch: true,
} as const;

export function toPolicyPerson(u: {
  id: number;
  roles: { role: { id: number } }[];
  branches: { branchId: number }[];
  mainBranch: number | null;
}): PolicyPerson {
  const roleIds = u.roles.map((r) => r.role.id);
  const branchIds = [
    ...new Set([
      ...u.branches.map((b) => b.branchId),
      ...(u.mainBranch ? [u.mainBranch] : []),
    ]),
  ];
  return {
    id: u.id,
    roleIds,
    branchIds: roleIds.includes(1) ? 'all' : branchIds,
  };
}

/** Live staff of this company; missing ids are a 400 carrying `missingMessage`. */
export async function loadPeople(
  prisma: PrismaService,
  ids: number[],
  companyId: number,
  missingMessage = 'Ijrochilardan biri topilmadi yoki faol emas',
) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await prisma.user.findMany({
    where: {
      id: { in: unique },
      companyId,
      deletedAt: null,
      status: { in: [...SIGN_IN_USER_STATUSES] },
      roles: { some: { role: { id: { in: [1, 2, 3, 4, 5] } } } },
    },
    select: PERSON_SELECT,
  });
  if (rows.length !== unique.length) {
    throw new BadRequestException(missingMessage);
  }
  return rows;
}

/**
 * Live staff for both lists, each inside the caller's reach. No name in the
 * refusal: it must not tell the caller who someone outside their ladder is.
 */
export async function loadAndCheckPeople(
  prisma: PrismaService,
  caller: PolicyPerson,
  companyId: number,
  assigneeIds: number[],
  watcherIds: number[],
) {
  const assignees = await loadPeople(prisma, assigneeIds, companyId);
  const watchers = await loadPeople(
    prisma,
    watcherIds,
    companyId,
    'Kuzatuvchilardan biri topilmadi yoki faol emas',
  );
  if (!assignees.every((u) => canAssignTo(caller, toPolicyPerson(u)))) {
    throw new ForbiddenException('Bu xodimga topshiriq bera olmaysiz');
  }
  if (!watchers.every((u) => canWatch(caller, toPolicyPerson(u)))) {
    throw new ForbiddenException('Bu xodimni kuzatuvchi qila olmaysiz');
  }
  return { assignees, watchers };
}
