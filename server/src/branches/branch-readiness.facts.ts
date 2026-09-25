import {
  CashAccountType,
  PaymentStatus,
  TelegramGroupStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReadinessFacts } from './branch-readiness';

/**
 * Gathers the raw facts `buildBranchReadiness` turns into checks. Split out
 * of `BranchesService.getReadiness` (which had grown past the 500-line file
 * guideline) so the guard/lookup stays with the service while every query
 * lives in one place.
 *
 * "Is there any?" questions use `findFirst`, never `count` — a large branch's
 * payment and enrollment tables are big and the answer only needs to be
 * binary.
 */
export async function gatherReadinessFacts(
  prisma: PrismaService,
  branch: {
    id: number;
    name: string;
    startOfWorkingDay: string | null;
    endOfWorkingDay: string | null;
  },
  companyId: number,
): Promise<ReadinessFacts> {
  const id = branch.id;

  const [
    cashTypes,
    roomCount,
    courseCount,
    adminCount,
    teachers,
    groupCount,
    runnableGroup,
    student,
    enrollment,
    payment,
    leadSection,
    telegramGroup,
  ] = await Promise.all([
    // Only ACTIVE accounts: `resolveAccountId` books payments to active ones.
    prisma.cashAccount.findMany({
      where: { branchId: id, companyId, deletedAt: null, isActive: true },
      select: { type: true },
    }),
    prisma.room.count({ where: { branchId: id, deletedAt: null } }),
    prisma.course.count({ where: { branchId: id, deletedAt: null } }),
    prisma.user.count({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        roles: { some: { role: { name: 'Administrator' } } },
        branches: { some: { branchId: id } },
      },
    }),
    prisma.user.findMany({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        roles: { some: { role: { name: 'Teacher' } } },
        branches: { some: { branchId: id } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        salaryConfigs: {
          where: { isActive: true },
          select: { id: true },
          take: 1,
        },
        // A Branch Director can only rate a pure(ish) Teacher (ADR-0033) — a
        // teacher who also holds CEO or Branch Director stays CEO-only, so
        // the readiness hint can tell the director "this one isn't yours".
        roles: { select: { role: { select: { name: true } } } },
      },
    }),
    prisma.group.count({ where: { branchId: id, deletedAt: null } }),
    // A group that can actually hold a lesson needs a teacher assigned, a
    // scheduled day and a start date (attendance-validation.service.ts).
    // Group STATUS is deliberately not filtered here: attendance only needs
    // the group ACTIVE, but a FORMING group becomes ACTIVE by itself once its
    // start date arrives (the group-status cron) — so "no start date" is the
    // real "never runnable" signal, and a group already PAUSED or COMPLETED
    // still proves the branch launched at some point.
    prisma.group.findFirst({
      where: {
        branchId: id,
        deletedAt: null,
        teachers: { some: {} },
        exactDays: { isEmpty: false },
        lessonStartTime: { not: null },
        startDate: { not: null },
      },
      select: { id: true },
    }),
    prisma.studentBranch.findFirst({
      where: { branchId: id, student: { deletedAt: null } },
      select: { studentId: true },
    }),
    // Any status: the question is "has this step ever been done?", so a
    // branch on summer break does not fall back to "not launched".
    prisma.enrollment.findFirst({
      where: { deletedAt: null, group: { branchId: id } },
      select: { id: true },
    }),
    // REFUNDED too: money did come in, the branch did launch.
    prisma.payment.findFirst({
      where: {
        branchId: id,
        companyId,
        status: { in: [PaymentStatus.COMPLETED, PaymentStatus.REFUNDED] },
      },
      select: { id: true },
    }),
    prisma.leadSection.findFirst({
      where: { deletedAt: null, column: { branchId: id, deletedAt: null } },
      select: { id: true },
    }),
    prisma.telegramGroup.findFirst({
      where: {
        branchId: id,
        status: TelegramGroupStatus.APPROVED,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    }),
  ]);

  const types = new Set(cashTypes.map((c) => c.type));

  return {
    branchId: branch.id,
    branchName: branch.name,
    hasCash: types.has(CashAccountType.CASH),
    hasBank: types.has(CashAccountType.BANK),
    hasWorkingHours: !!branch.startOfWorkingDay && !!branch.endOfWorkingDay,
    roomCount,
    courseCount,
    adminCount,
    teachers: teachers.map((t) => {
      const roleNames = t.roles.map((r) => r.role.name);
      return {
        id: t.id,
        name: `${t.firstName} ${t.lastName}`,
        hasRate: t.salaryConfigs.length > 0,
        ceoOnly:
          roleNames.includes('CEO') || roleNames.includes('Branch Director'),
      };
    }),
    groupCount,
    hasRunnableGroup: runnableGroup !== null,
    hasStudent: student !== null,
    hasEnrollment: enrollment !== null,
    hasPayment: payment !== null,
    hasLeadSection: leadSection !== null,
    hasTelegramGroup: telegramGroup !== null,
  };
}
